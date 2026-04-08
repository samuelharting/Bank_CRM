import { USER_ROLES } from "../../types";
import type { DemoStep } from "../types";

export const settingsSteps: DemoStep[] = [
  {
    id: "settings-intro",
    module: "settings",
    title: "Settings",
    body: "The Settings page lets you customize your CRM experience - default filters, display preferences, email sync, and system health.",
    beforeShow: [
      { type: "navigate", value: "/settings" },
      { type: "waitFor", target: "[data-tour='settings-preferences']" },
    ],
  },
  {
    id: "settings-preferences",
    module: "settings",
    title: "Your Preferences",
    body: "Set your default branch filter, leads per page, and notification preferences. These are stored locally and applied across all pages.",
    target: "settings-preferences",
    targetAttr: "data-tour",
    placement: "top",
  },
  {
    id: "settings-email-sync",
    module: "settings",
    title: "Email Sync",
    body: "This section shows the last email sync time and gives admins a manual sync control. Synced emails automatically appear as activities on the associated lead.",
    target: "settings-email-sync",
    placement: "top",
    requiredRoles: [USER_ROLES.ADMIN],
  },
  {
    id: "settings-health-open",
    module: "settings",
    title: "System Health",
    body: "We just expanded the diagnostics panel. The health indicator shows whether the API is connected and responsive. Green means all systems go; red means the backend may be down.",
    target: "settings-diagnostics",
    placement: "top",
    beforeShow: [
      { type: "dispatch", value: "crm-demo-open-settings-diagnostics" },
      { type: "waitFor", target: "[data-demo='settings-diagnostics'][open]", timeoutMs: 8000 },
    ],
    afterDismiss: [
      { type: "dispatch", value: "crm-demo-close-settings-diagnostics" },
      { type: "wait", value: "150" },
    ],
  },
  {
    id: "settings-admin-stats",
    module: "settings",
    title: "Admin Statistics",
    body: "Admin-only section showing system-wide stats: total users, leads, activities, and database health. Useful for capacity planning and monitoring.",
    target: "settings-admin-stats",
    placement: "top",
    requiredRoles: [USER_ROLES.ADMIN],
    beforeShow: [
      { type: "dispatch", value: "crm-demo-open-settings-admin-stats" },
      { type: "waitFor", target: "[data-demo='settings-admin-stats'][open]", timeoutMs: 8000 },
    ],
    afterDismiss: [
      { type: "dispatch", value: "crm-demo-close-settings-admin-stats" },
      { type: "wait", value: "150" },
    ],
  },
  {
    id: "settings-tour-restart",
    module: "settings",
    title: "Tour & Demo Controls",
    body: "You can restart the quick tour or this full demo from here. The tour is a shorter 24-step introduction; the demo is the deep dive you're doing right now.",
    target: "settings-tour",
    placement: "top",
  },
  {
    id: "demo-completion",
    module: "settings",
    title: "Demo Complete!",
    body: "You've seen every major feature of the Deerwood Bank CRM. You can restart this demo anytime from the Demo button in the header or from Settings. Happy selling!",
  },
];
