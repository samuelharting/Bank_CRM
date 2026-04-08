import type { DemoStep } from "../types";

export const contactsSteps: DemoStep[] = [
  {
    id: "contacts-intro",
    module: "contacts",
    title: "Contacts Stay Tied To The Lead",
    body: "We're now on the Contacts page with the same lead already filtered in. This keeps the rep focused on one relationship instead of bouncing between disconnected lists.",
    beforeShow: [
      { type: "waitFor", target: "[data-demo='contacts-lead-context']", timeoutMs: 12000 },
    ],
  },
  {
    id: "contacts-context",
    module: "contacts",
    title: "Lead Context Carries Forward",
    body: "The context banner confirms which relationship you're working. From here the rep can open the lead record again or clear the filter to return to the full contact portfolio.",
    target: "contacts-lead-context",
    placement: "bottom",
  },
  {
    id: "contacts-overview",
    module: "contacts",
    title: "See Every Person On The Relationship",
    body: "This list makes the relationship team visible at a glance: names, roles, contact details, and the lead they belong to. It is a cleaner operating model than relying on scattered email threads.",
    target: "contacts-overview",
    targetAttr: "data-tour",
    placement: "top",
  },
  {
    id: "contacts-detail-open",
    module: "contacts",
    title: "Open A Contact Record",
    body: "We'll open one of the contacts tied to this lead. The detail panel gives the banker a fast way to review who this person is and what relationship they support.",
    target: "contacts-detail",
    placement: "left",
    afterDismiss: [
      { type: "dispatch", value: "crm-demo-open-first-contact" },
      { type: "wait", value: "250" },
    ],
  },
  {
    id: "contacts-detail",
    module: "contacts",
    title: "Jump Back To The Lead Or Forward To Work",
    body: "From the contact detail, the rep can move straight back to the linked lead or continue to activities and reminders. The CRM keeps those paths one click away.",
    target: "contacts-linked-lead",
    placement: "left",
    beforeShow: [
      { type: "waitFor", target: "[data-demo='contacts-linked-lead']", timeoutMs: 8000 },
    ],
    afterDismiss: [
      { type: "dispatch", value: "crm-demo-close-contact-detail" },
      { type: "wait", value: "200" },
    ],
  },
  {
    id: "contacts-nav-activities",
    module: "contacts",
    title: "Review The Activity History",
    body: "Next we'll open Activities for this same lead so you can see the touchpoint history without losing context.",
    afterDismiss: [
      { type: "dispatch", value: "crm-demo-navigate-activities" },
      { type: "wait", value: "250" },
    ],
  },
];
