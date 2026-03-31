import { USER_ROLES } from "../../types";
import type { DemoStep } from "../types";

const REPORT_ROLES = [USER_ROLES.BRANCH_MANAGER, USER_ROLES.EXECUTIVE, USER_ROLES.ADMIN, USER_ROLES.COMPLIANCE_READONLY];

export const reportsSteps: DemoStep[] = [
  {
    id: "reports-intro",
    module: "reports",
    title: "Reports",
    body: "The Reports page offers four analytics views: Pipeline by Officer, Conversion Rates, Activity Volume, and Stale Leads. Each can be filtered and exported.",
    requiredRoles: REPORT_ROLES,
    beforeShow: [
      { type: "navigate", value: "/reports" },
      { type: "wait", value: "500" },
    ],
  },
  {
    id: "reports-tabs",
    module: "reports",
    title: "Report Types",
    body: "These tabs switch between four different reports. Let's click through them to see what each one shows.",
    target: "reports-tabs",
    placement: "bottom",
    requiredRoles: REPORT_ROLES,
  },
  {
    id: "reports-pipeline",
    module: "reports",
    title: "Pipeline by Officer",
    body: "This report shows how each rep's pipeline breaks down by stage. Great for 1-on-1 coaching conversations and identifying bottlenecks.",
    target: "reports-content",
    placement: "top",
    requiredRoles: REPORT_ROLES,
  },
  {
    id: "reports-tab-conversion",
    module: "reports",
    title: "Conversion Rates",
    body: "We switched to the Conversion Rates tab. This shows win/loss ratios by rep — who's closing deals and who might need coaching.",
    target: "reports-tabs",
    placement: "bottom",
    requiredRoles: REPORT_ROLES,
    beforeShow: [
      { type: "click", target: "[data-demo='reports-tabs'] button:nth-child(2)" },
      { type: "wait", value: "500" },
    ],
  },
  {
    id: "reports-tab-activity",
    module: "reports",
    title: "Activity Volume",
    body: "Now we're on Activity Volume — see how many calls, emails, and meetings each rep is logging. Spot who's putting in the work and who's falling behind.",
    target: "reports-tabs",
    placement: "bottom",
    requiredRoles: REPORT_ROLES,
    beforeShow: [
      { type: "click", target: "[data-demo='reports-tabs'] button:nth-child(3)" },
      { type: "wait", value: "500" },
    ],
  },
  {
    id: "reports-tab-stale",
    module: "reports",
    title: "Stale Leads",
    body: "The Stale Leads report flags leads with no activity in 14+ days. Use this to re-engage before they go cold.",
    target: "reports-tabs",
    placement: "bottom",
    requiredRoles: REPORT_ROLES,
    beforeShow: [
      { type: "click", target: "[data-demo='reports-tabs'] button:nth-child(4)" },
      { type: "wait", value: "500" },
    ],
    afterDismiss: [
      { type: "click", target: "[data-demo='reports-tabs'] button:first-child" },
      { type: "wait", value: "300" },
    ],
  },
  {
    id: "reports-filters",
    module: "reports",
    title: "Report Filters",
    body: "Filter any report by branch. The data updates immediately as you type — great for comparing branch performance.",
    target: "reports-filters",
    placement: "bottom",
    requiredRoles: REPORT_ROLES,
  },
  {
    id: "reports-download",
    module: "reports",
    title: "Download CSV",
    body: "Export any report as a CSV file for offline analysis, board presentations, or compliance reporting. It exports the current filtered view.",
    target: "reports-download",
    placement: "bottom",
    requiredRoles: REPORT_ROLES,
  },
  {
    id: "reports-done",
    module: "reports",
    title: "Reports Complete",
    body: "That's the Reports module. Managers and executives use these daily to track team performance and identify trends.",
    requiredRoles: REPORT_ROLES,
  },
];
