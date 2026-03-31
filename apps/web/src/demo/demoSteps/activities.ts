import type { DemoStep } from "../types";

export const activitiesSteps: DemoStep[] = [
  {
    id: "activities-intro",
    module: "activities",
    title: "Touchpoint History",
    body: "The Activities page shows every recorded interaction for the same lead. This is the running history that replaces the need to remember what happened from Outlook alone.",
    beforeShow: [
      { type: "dispatch", value: "crm-demo-navigate-activities" },
      { type: "waitFor", target: "[data-demo='activities-lead-context']", timeoutMs: 12000 },
    ],
  },
  {
    id: "activities-context",
    module: "activities",
    title: "Stay Focused On One Relationship",
    body: "The context banner keeps the rep anchored to the selected lead. If needed, you can jump back to the lead record or clear the filter to review the wider book of business.",
    target: "activities-lead-context",
    placement: "bottom",
  },
  {
    id: "activities-list",
    module: "activities",
    title: "Chronological Timeline",
    body: "Every call, email, meeting, and note rolls into this timeline so the next banker can pick up where the last conversation ended. Each entry also links straight back to the lead.",
    target: "activities-first-entry",
    placement: "top",
    skipIf: "[data-demo='activities-first-entry']",
  },
  {
    id: "activities-create-btn",
    module: "activities",
    title: "Log Activity From The Portfolio View",
    body: "When the rep is working from a list instead of inside the lead drawer, the Add Activity button opens the same logging flow from the page level.",
    target: "activities-create",
    placement: "bottom",
    skipIf: "[data-demo='activities-create']",
  },
  {
    id: "activities-create-form",
    module: "activities",
    title: "Consistent Logging Form",
    body: "The form follows the same pattern across the CRM: pick the lead, capture the touchpoint, and save. Clear validation and feedback keep reps from wondering whether anything happened.",
    target: "activities-form",
    placement: "left",
    skipIf: "[data-demo='activities-create']",
    beforeShow: [
      { type: "click", target: "[data-demo='activities-create']" },
      { type: "waitFor", target: "[data-demo='activities-form']", timeoutMs: 8000 },
    ],
    afterDismiss: [
      { type: "dispatch", value: "crm-close-overlays" },
      { type: "wait", value: "150" },
    ],
  },
  {
    id: "activities-nav-ticklers",
    module: "activities",
    title: "Set The Next Reminder",
    body: "After logging the touchpoint, the next step is setting or checking the reminder so the relationship does not go quiet.",
    beforeShow: [
      { type: "dispatch", value: "crm-demo-navigate-ticklers" },
      { type: "waitFor", target: "[data-demo='ticklers-lead-context']", timeoutMs: 12000 },
    ],
  },
];
