import type { UserRole } from "../types";

// ── Action types the DemoDriver can execute before/after showing a step ──

export type DemoActionType =
  | "navigate"     // change route
  | "waitFor"      // wait for a CSS selector to appear
  | "click"        // click a DOM element
  | "type"         // type text into an input
  | "select"       // pick a <select> value
  | "scroll"       // scroll element into view
  | "dispatch"     // fire a CustomEvent on window
  | "wait"         // pause N ms
  | "highlight";   // no-op action — spotlight only

export interface DemoAction {
  type: DemoActionType;
  /** CSS selector OR data-demo / data-tour id (resolved by driver). */
  target?: string;
  /** Route path, text to type, event name, or ms to wait (as string). */
  value?: string;
  /** CustomEvent detail payload. */
  detail?: unknown;
  /** Max ms to wait for target (default 5000). */
  timeoutMs?: number;
}

// ── Modules ──

export type DemoModule =
  | "shell"
  | "dashboard"
  | "leads"
  | "prep"
  | "contacts"
  | "activities"
  | "ticklers"
  | "map"
  | "import"
  | "reports"
  | "automations"
  | "settings";

export interface DemoModuleMeta {
  id: DemoModule;
  label: string;
  requiredRoles?: UserRole[];
}

// ── Steps ──

export interface DemoStep {
  id: string;
  module: DemoModule;
  title: string;
  body: string;
  /** Attribute value to spotlight (looked up via targetAttr). */
  target?: string;
  /** Which HTML attribute to query (default "data-demo"). */
  targetAttr?: "data-demo" | "data-tour";
  placement?: "top" | "bottom" | "left" | "right";
  /** If set, step is only shown when user has one of these roles. */
  requiredRoles?: UserRole[];
  /** Autopilot actions executed before the tooltip appears. */
  beforeShow?: DemoAction[];
  /** Cleanup actions after the user clicks Next. */
  afterDismiss?: DemoAction[];
  /** CSS selector — skip step entirely if element is absent. */
  skipIf?: string;
}

// ── Persisted state ──

export type DemoRoleKey = "base" | "manager" | "admin";

export interface DemoPersistedState {
  version: number;
  roleKey: DemoRoleKey;
  module: DemoModule;
  stepIndex: number;
  paused: boolean;
  completedAt: string | null;
}

// ── Provider context value ──

export interface DemoContextValue {
  isActive: boolean;
  isPaused: boolean;
  isExecuting: boolean;
  currentStep: DemoStep | null;
  currentModule: DemoModule | null;
  stepIndex: number;
  totalSteps: number;
  moduleProgress: { current: number; total: number; label: string };
  targetRect: DOMRect | null;
  start: () => void;
  resume: () => void;
  pause: () => void;
  next: () => void;
  back: () => void;
  skipModule: () => void;
  dismiss: () => void;
  hasStoredProgress: boolean;
}
