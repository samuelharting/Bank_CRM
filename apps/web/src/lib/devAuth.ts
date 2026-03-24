import type { AuthUser } from "../types";
import { isInTeams } from "./teams";

/** Must match `DEV_BYPASS_TOKEN` in `apps/api/src/middleware/auth.ts`. */
export const DEV_BYPASS_BEARER = "__dev_bypass__";

export const DEV_BYPASS_STORAGE_KEY = "devBypassUser";

/** True when local dev bypass UI should be used (browser, not Teams). */
export function isDevAuthBypassClientEnabled(): boolean {
  return import.meta.env.VITE_DEV_AUTH_BYPASS === "true" && !isInTeams();
}

export function readDevBypassUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(DEV_BYPASS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthUser;
    if (!parsed?.id || !parsed?.email || !parsed?.role) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeDevBypassUser(user: AuthUser): void {
  localStorage.setItem(DEV_BYPASS_STORAGE_KEY, JSON.stringify(user));
  window.dispatchEvent(new Event("dev-bypass-changed"));
}

export function clearDevBypassUser(): void {
  localStorage.removeItem(DEV_BYPASS_STORAGE_KEY);
  window.dispatchEvent(new Event("dev-bypass-changed"));
}
