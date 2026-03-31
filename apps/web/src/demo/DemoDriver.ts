import type { DemoAction } from "./types";

const DEFAULT_TIMEOUT = 5000;

/** Resolve a target string to a CSS selector. */
function resolveSelector(action: DemoAction): string | null {
  if (!action.target) return null;
  // Already a CSS selector (starts with [ . # or element name)
  if (/^[[.#a-z]/i.test(action.target)) return action.target;
  // Otherwise treat as a data-demo id
  return `[data-demo="${action.target}"]`;
}

/** Poll for an element matching `selector` via rAF, with timeout. */
function waitForElement(selector: string, timeoutMs: number, signal: AbortSignal): Promise<Element | null> {
  return new Promise((resolve) => {
    const start = performance.now();
    const check = () => {
      if (signal.aborted) return resolve(null);
      const el = document.querySelector(selector);
      if (el) return resolve(el);
      if (performance.now() - start > timeoutMs) return resolve(null);
      requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  });
}

function waitMs(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const id = window.setTimeout(resolve, ms);
    const onAbort = () => { clearTimeout(id); resolve(); };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/** Idle wait — lets React flush after navigation. */
function waitForIdle(signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    requestAnimationFrame(() => setTimeout(resolve, 80));
  });
}

const MUTATIONS_ALLOWED = import.meta.env.VITE_DEMO_ALLOW_MUTATIONS === "true";

async function executeOne(action: DemoAction, signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) return false;
  const timeout = action.timeoutMs ?? DEFAULT_TIMEOUT;

  switch (action.type) {
    case "navigate": {
      if (!action.value) return true;
      window.dispatchEvent(new CustomEvent("crm-demo-navigate", { detail: action.value }));
      await waitForIdle(signal);
      await waitForIdle(signal); // extra tick for lazy routes
      return true;
    }

    case "waitFor": {
      const sel = resolveSelector(action);
      if (!sel) return true;
      const el = await waitForElement(sel, timeout, signal);
      return el !== null;
    }

    case "click": {
      const sel = resolveSelector(action);
      if (!sel) return true;
      const el = await waitForElement(sel, timeout, signal);
      if (!el) return false;
      // Gate mutations
      if (!MUTATIONS_ALLOWED && (el as HTMLElement).dataset?.demoMutates) {
        return true; // skip silently in read-only mode
      }
      (el as HTMLElement).click();
      await waitForIdle(signal);
      return true;
    }

    case "type": {
      const sel = resolveSelector(action);
      if (!sel || !action.value) return true;
      const el = await waitForElement(sel, timeout, signal) as HTMLInputElement | null;
      if (!el) return false;
      if (!MUTATIONS_ALLOWED && el.dataset?.demoMutates) return true;
      // Use native setter so React sees the change
      const nativeSet = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      if (nativeSet) {
        nativeSet.call(el, action.value);
      } else {
        el.value = action.value;
      }
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      await waitForIdle(signal);
      return true;
    }

    case "select": {
      const sel = resolveSelector(action);
      if (!sel || !action.value) return true;
      const el = await waitForElement(sel, timeout, signal) as HTMLSelectElement | null;
      if (!el) return false;
      if (!MUTATIONS_ALLOWED && el.dataset?.demoMutates) return true;
      el.value = action.value;
      el.dispatchEvent(new Event("change", { bubbles: true }));
      await waitForIdle(signal);
      return true;
    }

    case "scroll": {
      const sel = resolveSelector(action);
      if (!sel) return true;
      const el = await waitForElement(sel, timeout, signal);
      if (!el) return false;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      await waitMs(400, signal); // let scroll settle
      return true;
    }

    case "dispatch": {
      if (!action.value) return true;
      window.dispatchEvent(new CustomEvent(action.value, { detail: action.detail }));
      await waitForIdle(signal);
      return true;
    }

    case "wait": {
      const ms = Number(action.value) || 500;
      await waitMs(ms, signal);
      return true;
    }

    case "highlight":
      return true;
  }
}

export interface DemoDriverResult {
  success: boolean;
  failedAction?: DemoAction;
}

/**
 * Execute an array of DemoActions sequentially.
 * Respects the AbortSignal for cancellation on pause / dismiss.
 */
export async function executeDemoActions(
  actions: DemoAction[],
  signal: AbortSignal,
): Promise<DemoDriverResult> {
  for (const action of actions) {
    if (signal.aborted) return { success: false };
    const ok = await executeOne(action, signal);
    if (!ok) return { success: false, failedAction: action };
  }
  return { success: true };
}
