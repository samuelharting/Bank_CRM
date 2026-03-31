import { USER_ROLES } from "../../types";
import type { DemoStep } from "../types";

export const automationsSteps: DemoStep[] = [
  {
    id: "automations-intro",
    module: "automations",
    title: "Automations",
    body: "Automations let admins create workflow rules that fire automatically. Set triggers, define conditions, and choose actions — the CRM does the rest.",
    requiredRoles: [USER_ROLES.ADMIN],
    beforeShow: [
      { type: "navigate", value: "/automations" },
      { type: "wait", value: "500" },
    ],
  },
  {
    id: "automations-list",
    module: "automations",
    title: "Automation List",
    body: "Each automation card shows its name, description, trigger type, action type, and whether it's active. Let's explore what's here.",
    target: "automations-list",
    placement: "top",
    requiredRoles: [USER_ROLES.ADMIN],
  },
  {
    id: "automations-toggle",
    module: "automations",
    title: "Enable / Disable",
    body: "This checkbox toggles an automation on or off without deleting it. Disabled automations keep their config but won't fire — great for testing or seasonal rules.",
    target: "automations-toggle",
    placement: "left",
    requiredRoles: [USER_ROLES.ADMIN],
    skipIf: "[data-demo='automations-toggle']",
  },
  {
    id: "automations-logs-open",
    module: "automations",
    title: "Execution Logs",
    body: "We just clicked the first automation to expand its execution logs. Each entry shows when it fired, what it did, and whether it succeeded or failed — essential for debugging.",
    target: "automations-logs",
    placement: "left",
    requiredRoles: [USER_ROLES.ADMIN],
    beforeShow: [
      { type: "dispatch", value: "crm-demo-open-first-automation" },
      { type: "waitFor", target: "[data-demo='automations-logs']", timeoutMs: 10000 },
    ],
  },
  {
    id: "automations-create",
    module: "automations",
    title: "Create Automation",
    body: "Click this button to build a new automation. You'll choose a trigger (Lead Status Change, No Activity for N Days, Follow-Up Overdue, etc.) and an action (Send Notification, Create Task, Change Status, Assign Lead). Each has its own configurable options.",
    target: "automations-create",
    placement: "bottom",
    requiredRoles: [USER_ROLES.ADMIN],
  },
  {
    id: "automations-done",
    module: "automations",
    title: "Automations Complete",
    body: "That's the Automations engine! Only admins can create and manage these. Let's finish up with Settings.",
    requiredRoles: [USER_ROLES.ADMIN],
  },
];
