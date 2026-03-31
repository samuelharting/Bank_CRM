import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { TOUR_STEPS, type TourStep } from "./tourSteps";

const STORAGE_KEY = "crm-tour";
const TOUR_VERSION = 1;

interface TourState {
  completed: boolean;
  skipped: boolean;
  currentStep: number;
  version: number;
}

function readStorage(): TourState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as TourState;
  } catch {
    return null;
  }
}

function writeStorage(state: TourState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/** Wait for a DOM element matching the selector, polling via rAF. */
function waitForElement(selector: string, timeoutMs = 3000): Promise<Element | null> {
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

/** Small idle wait to let React flush after navigation. */
function waitForIdle(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => setTimeout(resolve, 60));
  });
}

export interface TourContextValue {
  isActive: boolean;
  currentStepIndex: number;
  currentStep: TourStep | null;
  totalSteps: number;
  targetRect: DOMRect | null;
  start: () => void;
  next: () => void;
  back: () => void;
  skip: () => void;
  reset: () => void;
  showPrompt: boolean;
  dismissPrompt: () => void;
}

const TourContext = createContext<TourContextValue | null>(null);

export function useTour(): TourContextValue {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error("useTour must be used inside TourProvider");
  return ctx;
}

export function TourProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const { role } = useAuth();

  const filteredSteps = useMemo(
    () => TOUR_STEPS.filter((s) => !s.requiredRoles || s.requiredRoles.includes(role)),
    [role],
  );

  const [isActive, setIsActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const tourLeadIdRef = useRef<string | null>(null);
  const transitioning = useRef(false);

  // Suppress tour prompt when demo mode is active
  useEffect(() => {
    const handler = (e: Event) => {
      if ((e as CustomEvent<boolean>).detail) setShowPrompt(false);
    };
    window.addEventListener("crm-demo-active", handler);
    return () => window.removeEventListener("crm-demo-active", handler);
  }, []);

  // On mount: decide whether to show prompt or resume
  useEffect(() => {
    const stored = readStorage();
    if (!stored) {
      // First visit — show prompt after short delay
      const t = setTimeout(() => setShowPrompt(true), 1500);
      return () => clearTimeout(t);
    }
    if (stored.version < TOUR_VERSION) {
      // Tour updated, re-prompt
      setShowPrompt(true);
    }
    // Don't auto-resume — user can restart from Settings
  }, []);

  const currentStep = isActive ? filteredSteps[stepIndex] ?? null : null;

  // Update target rect when step changes or on scroll/resize
  useEffect(() => {
    if (!currentStep?.target) {
      setTargetRect(null);
      return;
    }
    const update = () => {
      const el = document.querySelector(`[data-tour="${currentStep.target}"]`);
      if (el) setTargetRect(el.getBoundingClientRect());
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [currentStep]);

  const goToStep = useCallback(
    async (nextIndex: number) => {
      if (transitioning.current) return;
      transitioning.current = true;
      try {
        const step = filteredSteps[nextIndex];
        if (!step) return;

        // Determine the route, injecting leadId for prep
        let targetRoute = step.route;
        if (step.id === "prep-brief" && tourLeadIdRef.current) {
          targetRoute = `/prep?leadId=${tourLeadIdRef.current}`;
        }

        // Close drawer before navigating away from /leads if needed
        if (step.id === "prep-brief") {
          window.dispatchEvent(new CustomEvent("crm-tour-close-drawer"));
          await waitForIdle();
        }

        // Navigate if route changed
        const currentPath = location.pathname;
        const stepPath = targetRoute.split("?")[0];
        if (currentPath !== stepPath) {
          // Open mobile sidebar for nav-targeting steps
          if (step.target?.startsWith("nav-")) {
            window.dispatchEvent(new CustomEvent("crm-tour-open-sidebar"));
            await waitForIdle();
          }
          navigate(targetRoute);
          await waitForIdle();
          await waitForIdle(); // extra tick for lazy-loaded pages
        }

        // Run beforeShow actions based on step id
        if (step.id === "lead-first-row") {
          window.dispatchEvent(new CustomEvent("crm-tour-open-first-lead"));
          await waitForIdle();
        }
        if (step.id === "lead-tab-activity") {
          window.dispatchEvent(new CustomEvent("crm-tour-set-detail-tab", { detail: "activity" }));
          await waitForIdle();
        }
        if (step.id === "lead-tab-contacts") {
          window.dispatchEvent(new CustomEvent("crm-tour-set-detail-tab", { detail: "contacts" }));
          await waitForIdle();
        }

        // Wait for target element if needed
        if (step.target) {
          const el = await waitForElement(`[data-tour="${step.target}"]`);
          if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
            await waitForIdle();
          }
        }

        setStepIndex(nextIndex);
        writeStorage({ completed: false, skipped: false, currentStep: nextIndex, version: TOUR_VERSION });
      } finally {
        transitioning.current = false;
      }
    },
    [filteredSteps, location.pathname, navigate],
  );

  const start = useCallback(() => {
    setShowPrompt(false);
    setStepIndex(0);
    setIsActive(true);
    writeStorage({ completed: false, skipped: false, currentStep: 0, version: TOUR_VERSION });
    // Navigate to first step route
    const first = filteredSteps[0];
    if (first && location.pathname !== first.route) {
      navigate(first.route);
    }
  }, [filteredSteps, location.pathname, navigate]);

  const next = useCallback(() => {
    const nextIdx = stepIndex + 1;
    if (nextIdx >= filteredSteps.length) {
      // Tour complete
      setIsActive(false);
      setTargetRect(null);
      writeStorage({ completed: true, skipped: false, currentStep: 0, version: TOUR_VERSION });
      return;
    }
    goToStep(nextIdx);
  }, [stepIndex, filteredSteps.length, goToStep]);

  const back = useCallback(() => {
    if (stepIndex <= 0) return;
    goToStep(stepIndex - 1);
  }, [stepIndex, goToStep]);

  const skip = useCallback(() => {
    setIsActive(false);
    setTargetRect(null);
    writeStorage({ completed: false, skipped: true, currentStep: stepIndex, version: TOUR_VERSION });
  }, [stepIndex]);

  const reset = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setIsActive(false);
    setStepIndex(0);
    setTargetRect(null);
    setShowPrompt(false);
  }, []);

  const dismissPrompt = useCallback(() => {
    setShowPrompt(false);
    writeStorage({ completed: false, skipped: true, currentStep: 0, version: TOUR_VERSION });
  }, []);

  // Listen for tour-lead-selected events from Leads.tsx
  useEffect(() => {
    const handler = (e: Event) => {
      const leadId = (e as CustomEvent<string>).detail;
      if (leadId) tourLeadIdRef.current = leadId;
    };
    window.addEventListener("crm-tour-lead-selected", handler);
    return () => window.removeEventListener("crm-tour-lead-selected", handler);
  }, []);

  const value = useMemo<TourContextValue>(
    () => ({
      isActive,
      currentStepIndex: stepIndex,
      currentStep,
      totalSteps: filteredSteps.length,
      targetRect,
      start,
      next,
      back,
      skip,
      reset,
      showPrompt,
      dismissPrompt,
    }),
    [isActive, stepIndex, currentStep, filteredSteps.length, targetRect, start, next, back, skip, reset, showPrompt, dismissPrompt],
  );

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
}
