import { USER_ROLES } from "../../types";
import type { DemoStep } from "../types";

export const dashboardSteps: DemoStep[] = [
  {
    id: "dash-intro",
    module: "dashboard",
    title: "Start With Today's Priorities",
    body: "The dashboard is where a banker starts the day. It shows what needs attention now, how healthy the pipeline looks, and where to jump next without digging through email.",
    beforeShow: [
      { type: "navigate", value: "/dashboard" },
      { type: "waitFor", target: "[data-tour='dashboard-stats']" },
    ],
  },
  {
    id: "dash-work-queue",
    module: "dashboard",
    title: "Today's Work Queue",
    body: "For sales reps, this queue is the fastest way to work the CRM. It brings overdue and upcoming follow-ups to the top so you can open the relationship, review context, and take the next step.",
    target: "dashboard-work-queue",
    placement: "top",
    requiredRoles: [USER_ROLES.SALES_REP],
  },
  {
    id: "dash-kpi-cards",
    module: "dashboard",
    title: "Pipeline Snapshot",
    body: "These cards answer the quick management questions: how many active leads you own, how much pipeline is open, what closed recently, and whether conversion is trending the right way.",
    target: "dashboard-stats",
    targetAttr: "data-tour",
    placement: "bottom",
  },
  {
    id: "dash-pipeline",
    module: "dashboard",
    title: "Where Deals Are Stalling",
    body: "The stage chart helps you see whether work is piling up in the wrong place. Reps can spot slow-moving relationships, and managers can see where coaching or capacity may be needed.",
    target: "dashboard-pipeline",
    targetAttr: "data-tour",
    placement: "bottom",
  },
  {
    id: "dash-feed",
    module: "dashboard",
    title: "Recent Relationship Activity",
    body: "This feed keeps the team grounded in what changed most recently. A rep can open a lead from here at any time, but the work queue is usually the cleanest starting point for the day.",
    target: "dashboard-feed",
    placement: "top",
  },
  {
    id: "dash-leaderboard",
    module: "dashboard",
    title: "Manager View",
    body: "Managers and executives also get team performance context here. The leaderboard makes it easy to compare outreach volume, pipeline ownership, and conversion across reps.",
    target: "dashboard-leaderboard",
    placement: "top",
    requiredRoles: [USER_ROLES.BRANCH_MANAGER, USER_ROLES.EXECUTIVE, USER_ROLES.ADMIN],
  },
  {
    id: "dash-open-work-item",
    module: "dashboard",
    title: "Open The Next Relationship",
    body: "Now we'll open a live relationship straight from the dashboard and carry it through the rest of the CRM. This keeps the story connected whether you're working a queue or reviewing team activity.",
    target: "dashboard-primary-relationship",
    placement: "top",
    requiredRoles: [USER_ROLES.SALES_REP, USER_ROLES.BRANCH_MANAGER, USER_ROLES.EXECUTIVE, USER_ROLES.ADMIN],
    afterDismiss: [
      { type: "dispatch", value: "crm-demo-open-dashboard-followup" },
      { type: "wait", value: "250" },
    ],
  },
];
