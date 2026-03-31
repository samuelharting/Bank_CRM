import type { DemoStep } from "../types";

export const prepSteps: DemoStep[] = [
  {
    id: "prep-intro",
    module: "prep",
    title: "Meeting Prep In One Click",
    body: "Now we're looking at the same lead's prep sheet. This is how a banker gets ready for a call without piecing context together across Outlook, notes, and browser tabs.",
    beforeShow: [
      { type: "dispatch", value: "crm-demo-navigate-prep" },
      { type: "waitFor", target: "[data-demo='prep-generate']", timeoutMs: 12000 },
    ],
  },
  {
    id: "prep-generate",
    module: "prep",
    title: "Generate The Brief",
    body: "The brief combines CRM activity with outside context so the rep can walk into the conversation prepared. If the AI provider is unavailable, the CRM still falls back to the relationship data already on file.",
    target: "prep-generate",
    placement: "bottom",
  },
  {
    id: "prep-brief",
    module: "prep",
    title: "Call Notes, Risks, And Next Steps",
    body: "This output is designed for action, not novelty. The rep gets a summary of the relationship, talking points, and recommended follow-up so the next move is clear before the meeting starts.",
    target: "prep-brief",
    targetAttr: "data-tour",
    placement: "bottom",
    beforeShow: [
      { type: "click", target: "[data-demo='prep-generate']" },
      { type: "waitFor", target: "[data-tour='prep-brief']", timeoutMs: 15000 },
    ],
  },
  {
    id: "prep-workflow-note",
    module: "prep",
    title: "Close The Loop After The Meeting",
    body: "The prep page reinforces the rep workflow: review the brief, return to the lead, log what happened, and set the next reminder while the conversation is still fresh.",
    target: "prep-workflow-note",
    placement: "bottom",
  },
  {
    id: "prep-nav-contacts",
    module: "prep",
    title: "See The Same Lead On Contacts",
    body: "Next we'll jump to Contacts with this lead already in focus so you can see how the same relationship carries across the CRM.",
    beforeShow: [
      { type: "dispatch", value: "crm-demo-navigate-contacts" },
      { type: "waitFor", target: "[data-demo='contacts-lead-context']", timeoutMs: 12000 },
    ],
  },
];
