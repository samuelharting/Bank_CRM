import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { executeDemoActions } from "./DemoDriver";
import { getDemoModulesForRole, getDemoStepsForRole, roleToKey } from "./demoSteps";
import type { DemoContextValue, DemoPersistedState } from "./types";

const STORAGE_KEY = "crm-demo";
const DEMO_VERSION = 1;

function readStorage(): DemoPersistedState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DemoPersistedState;
    if (parsed.version !== DEMO_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStorage(state: DemoPersistedState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function clearStorage(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/** Wait for DOM to settle after navigation. */
function waitForIdle(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => setTimeout(resolve, 80));
  });
}

/** Wait for a DOM element, polling via rAF. */
function waitForElement(selector: string, timeoutMs = 5000): Promise<Element | null> {
  return new Promise((resolve) => {
    const start = performance.now();
    const check = () => {
      const el = document.querySelector(selector);
      if (el) return resolve(el);
      if (performance.now() - start > timeoutMs) return resolve(null);
      requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  });
}

const DemoContext = createContext<DemoContextValue | null>(null);

export function useDemo(): DemoContextValue {
  const ctx = useContext(DemoContext);
  if (!ctx) throw new Error("useDemo must be used inside DemoProvider");
  return ctx;
}

export function DemoProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const navigate = useNavigate();
  const { role } = useAuth();

  const roleKey = useMemo(() => roleToKey(role), [role]);
  const steps = useMemo(() => getDemoStepsForRole(role), [role]);
  const modules = useMemo(() => getDemoModulesForRole(role), [role]);

  const [isActive, setIsActive] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [hasStoredProgress, setHasStoredProgress] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const transitioning = useRef(false);
  const targetRectRef = useRef<DOMRect | null>(null);

  // Check for stored progress on mount
  useEffect(() => {
    const stored = readStorage();
    setHasStoredProgress(stored !== null && !stored.completedAt && stored.stepIndex > 0);
  }, []);

  // Broadcast active state so TourProvider can suppress its prompt
  useEffect(() => {
    if (isActive && !isPaused) {
      window.dispatchEvent(new CustomEvent("crm-demo-active", { detail: true }));
    }
    return () => {
      window.dispatchEvent(new CustomEvent("crm-demo-active", { detail: false }));
    };
  }, [isActive, isPaused]);

  // Listen for navigation requests from DemoDriver
  useEffect(() => {
    const handler = (e: Event) => {
      const route = (e as CustomEvent<string>).detail;
      if (route) navigate(route);
    };
    const prepHandler = () => {
      const leadId = (window as unknown as Record<string, string | undefined>).__demoLeadId;
      navigate(leadId ? `/prep?leadId=${leadId}` : "/prep");
    };
    const contactsHandler = () => {
      const leadId = (window as unknown as Record<string, string | undefined>).__demoLeadId;
      navigate(leadId ? `/contacts?leadId=${leadId}` : "/contacts");
    };
    const activitiesHandler = () => {
      const leadId = (window as unknown as Record<string, string | undefined>).__demoLeadId;
      navigate(leadId ? `/activities?leadId=${leadId}` : "/activities");
    };
    const ticklersHandler = () => {
      const leadId = (window as unknown as Record<string, string | undefined>).__demoLeadId;
      navigate(leadId ? `/ticklers?leadId=${leadId}` : "/ticklers");
    };
    window.addEventListener("crm-demo-navigate", handler);
    window.addEventListener("crm-demo-navigate-prep", prepHandler);
    window.addEventListener("crm-demo-navigate-contacts", contactsHandler);
    window.addEventListener("crm-demo-navigate-activities", activitiesHandler);
    window.addEventListener("crm-demo-navigate-ticklers", ticklersHandler);
    return () => {
      window.removeEventListener("crm-demo-navigate", handler);
      window.removeEventListener("crm-demo-navigate-prep", prepHandler);
      window.removeEventListener("crm-demo-navigate-contacts", contactsHandler);
      window.removeEventListener("crm-demo-navigate-activities", activitiesHandler);
      window.removeEventListener("crm-demo-navigate-ticklers", ticklersHandler);
    };
  }, [navigate]);

  // Escape key → pause
  useEffect(() => {
    if (!isActive || isPaused) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        e.preventDefault();
        pauseDemo();
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, isPaused]);

  const currentStep = isActive ? steps[stepIndex] ?? null : null;

  const runAfterDismiss = useCallback(
    async (index: number | null, signal: AbortSignal): Promise<void> => {
      if (index === null) return;
      const step = steps[index];
      if (!step?.afterDismiss?.length) return;
      await executeDemoActions(step.afterDismiss, signal);
      if (!signal.aborted) {
        await waitForIdle();
      }
    },
    [steps],
  );

  // Compute current module and progress within that module
  const moduleProgress = useMemo(() => {
    if (!currentStep) return { current: 0, total: 0, label: "" };
    const mod = currentStep.module;
    const meta = modules.find((m) => m.id === mod);
    const modSteps = steps.filter((s) => s.module === mod);
    const idxInMod = modSteps.indexOf(currentStep);
    return {
      current: idxInMod + 1,
      total: modSteps.length,
      label: meta?.label ?? mod,
    };
  }, [currentStep, modules, steps]);

  // Keep the spotlight in sync while the page animates, resizes, or reflows.
  useEffect(() => {
    if (!currentStep?.target || isPaused) {
      targetRectRef.current = null;
      setTargetRect(null);
      return;
    }

    const attr = currentStep.targetAttr ?? "data-demo";
    const selector = `[${attr}="${currentStep.target}"]`;
    let frameId = 0;

    const syncRect = (nextRect: DOMRect | null) => {
      const previous = targetRectRef.current;
      const changed =
        previous === null ||
        nextRect === null ||
        previous.top !== nextRect.top ||
        previous.left !== nextRect.left ||
        previous.width !== nextRect.width ||
        previous.height !== nextRect.height;

      if (!changed) return;

      targetRectRef.current = nextRect;
      setTargetRect(nextRect);
    };

    const update = () => {
      const el = document.querySelector(selector);
      if (el) {
        syncRect(el.getBoundingClientRect());
      } else {
        syncRect(null);
      }
    };

    const tick = () => {
      update();
      frameId = window.requestAnimationFrame(tick);
    };

    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    frameId = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [currentStep, isPaused]);

  const showStep = useCallback(
    async (nextIndex: number, cleanupIndex: number | null = null) => {
      if (transitioning.current) return;
      transitioning.current = true;
      setIsExecuting(true);

      // Abort any previous actions
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        await runAfterDismiss(cleanupIndex, controller.signal);
        if (controller.signal.aborted) return;

        let index = nextIndex;
        while (index < steps.length) {
          const step = steps[index];
          if (!step) return;

          if (step.skipIf) {
            const el = document.querySelector(step.skipIf);
            if (!el) {
              index += 1;
              continue;
            }
          }

          if (step.beforeShow && step.beforeShow.length > 0) {
            const result = await executeDemoActions(step.beforeShow, controller.signal);
            if (controller.signal.aborted) return;
            if (!result.success) {
              window.dispatchEvent(
                new CustomEvent("crm-demo-toast", {
                  detail: { message: `Skipping: "${step.title}" — element not found`, type: "warn" },
                }),
              );
              index += 1;
              await waitForIdle();
              continue;
            }
          }

          if (step.target) {
            const attr = step.targetAttr ?? "data-demo";
            const el = await waitForElement(`[${attr}="${step.target}"]`);
            if (el) {
              el.scrollIntoView({ behavior: "smooth", block: "center" });
              await waitForIdle();
            }
          }

          setStepIndex(index);
          writeStorage({
            version: DEMO_VERSION,
            roleKey,
            module: step.module,
            stepIndex: index,
            paused: false,
            completedAt: null,
          });
          return;
        }

        setIsActive(false);
        setIsPaused(false);
        setTargetRect(null);
        setHasStoredProgress(false);
        writeStorage({
          version: DEMO_VERSION,
          roleKey,
          module: steps[steps.length - 1]?.module ?? "settings",
          stepIndex: Math.max(steps.length - 1, 0),
          paused: false,
          completedAt: new Date().toISOString(),
        });
      } finally {
        setIsExecuting(false);
        transitioning.current = false;
      }
    },
    [roleKey, runAfterDismiss, steps],
  );

  const startDemo = useCallback(() => {
    setStepIndex(0);
    setIsActive(true);
    setIsPaused(false);
    setHasStoredProgress(false);
    clearStorage();
    void showStep(0);
  }, [showStep]);

  const resumeDemo = useCallback(() => {
    const stored = readStorage();
    if (stored && stored.stepIndex > 0 && stored.stepIndex < steps.length) {
      setStepIndex(stored.stepIndex);
      setIsActive(true);
      setIsPaused(false);
      void showStep(stored.stepIndex);
    } else {
      startDemo();
    }
  }, [steps.length, showStep, startDemo]);

  const pauseDemo = useCallback(() => {
    abortRef.current?.abort();
    setIsPaused(true);
    setTargetRect(null);
    setIsExecuting(false);
    transitioning.current = false;

    const step = steps[stepIndex];
    if (step?.afterDismiss?.length) {
      const controller = new AbortController();
      abortRef.current = controller;
      void executeDemoActions(step.afterDismiss, controller.signal);
    }
    if (step) {
      writeStorage({
        version: DEMO_VERSION,
        roleKey,
        module: step.module,
        stepIndex,
        paused: true,
        completedAt: null,
      });
    }
    setHasStoredProgress(true);
  }, [stepIndex, steps, roleKey]);

  const nextStep = useCallback(() => {
    const nextIdx = stepIndex + 1;
    if (nextIdx >= steps.length) {
      void showStep(nextIdx, stepIndex);
      return;
    }
    void showStep(nextIdx, stepIndex);
  }, [showStep, stepIndex, steps.length]);

  const backStep = useCallback(() => {
    if (stepIndex <= 0) return;
    void showStep(stepIndex - 1, stepIndex);
  }, [stepIndex, showStep]);

  const skipModule = useCallback(() => {
    if (!currentStep) return;
    const currentMod = currentStep.module;
    const nextModIdx = steps.findIndex((s, i) => i > stepIndex && s.module !== currentMod);
    if (nextModIdx === -1) {
      nextStep();
      return;
    }
    void showStep(nextModIdx, stepIndex);
  }, [currentStep, stepIndex, steps, showStep, nextStep]);

  const dismissDemo = useCallback(() => {
    abortRef.current?.abort();
    const step = steps[stepIndex];
    if (step?.afterDismiss?.length) {
      const controller = new AbortController();
      abortRef.current = controller;
      void executeDemoActions(step.afterDismiss, controller.signal);
    }
    setIsActive(false);
    setIsPaused(false);
    setTargetRect(null);
    setIsExecuting(false);
    transitioning.current = false;
    clearStorage();
    setHasStoredProgress(false);
  }, [stepIndex, steps]);

  const value = useMemo<DemoContextValue>(
    () => ({
      isActive,
      isPaused,
      isExecuting,
      currentStep,
      currentModule: currentStep?.module ?? null,
      stepIndex,
      totalSteps: steps.length,
      moduleProgress,
      targetRect,
      start: startDemo,
      resume: resumeDemo,
      pause: pauseDemo,
      next: nextStep,
      back: backStep,
      skipModule,
      dismiss: dismissDemo,
      hasStoredProgress,
    }),
    [
      isActive, isPaused, isExecuting, currentStep, stepIndex, steps.length,
      moduleProgress, targetRect, startDemo, resumeDemo, pauseDemo, nextStep,
      backStep, skipModule, dismissDemo, hasStoredProgress,
    ],
  );

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}
