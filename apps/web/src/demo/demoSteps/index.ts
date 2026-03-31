import { USER_ROLES, type UserRole } from "../../types";
import type { DemoModuleMeta, DemoRoleKey, DemoStep } from "../types";
import { shellSteps } from "./shell";
import { dashboardSteps } from "./dashboard";
import { leadsSteps } from "./leads";
import { prepSteps } from "./prep";
import { contactsSteps } from "./contacts";
import { activitiesSteps } from "./activities";
import { ticklersSteps } from "./ticklers";
import { mapSteps } from "./map";
import { importSteps } from "./import";
import { reportsSteps } from "./reports";
import { automationsSteps } from "./automations";
import { settingsSteps } from "./settings";

// Ordered list of all modules with role gates
export const ALL_MODULES: DemoModuleMeta[] = [
  { id: "shell", label: "Shell & Navigation" },
  { id: "dashboard", label: "Dashboard" },
  { id: "leads", label: "Leads" },
  { id: "prep", label: "AI Prep" },
  { id: "contacts", label: "Contacts" },
  { id: "activities", label: "Activities" },
  { id: "ticklers", label: "Ticklers" },
  { id: "map", label: "Map" },
  { id: "import", label: "Import", requiredRoles: [USER_ROLES.ADMIN, USER_ROLES.BRANCH_MANAGER, USER_ROLES.EXECUTIVE] },
  { id: "reports", label: "Reports", requiredRoles: [USER_ROLES.BRANCH_MANAGER, USER_ROLES.EXECUTIVE, USER_ROLES.ADMIN, USER_ROLES.COMPLIANCE_READONLY] },
  { id: "automations", label: "Automations", requiredRoles: [USER_ROLES.ADMIN] },
  { id: "settings", label: "Settings" },
];

// All steps in module order
const ALL_STEPS: DemoStep[] = [
  ...shellSteps,
  ...dashboardSteps,
  ...leadsSteps,
  ...prepSteps,
  ...contactsSteps,
  ...activitiesSteps,
  ...ticklersSteps,
  ...mapSteps,
  ...importSteps,
  ...reportsSteps,
  ...automationsSteps,
  ...settingsSteps,
];

export function roleToKey(role: UserRole): DemoRoleKey {
  if (role === USER_ROLES.ADMIN) return "admin";
  if (
    role === USER_ROLES.BRANCH_MANAGER ||
    role === USER_ROLES.EXECUTIVE ||
    role === USER_ROLES.COMPLIANCE_READONLY
  ) {
    return "manager";
  }
  return "base";
}

export function getDemoModulesForRole(role: UserRole): DemoModuleMeta[] {
  return ALL_MODULES.filter((m) => !m.requiredRoles || m.requiredRoles.includes(role));
}

export function getDemoStepsForRole(role: UserRole): DemoStep[] {
  const allowedModules = new Set(getDemoModulesForRole(role).map((m) => m.id));
  return ALL_STEPS.filter((step) => {
    if (!allowedModules.has(step.module)) return false;
    if (step.requiredRoles && !step.requiredRoles.includes(role)) return false;
    return true;
  });
}
