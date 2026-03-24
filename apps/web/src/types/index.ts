export const USER_ROLES = {
  SALES_REP: "SALES_REP",
  BRANCH_MANAGER: "BRANCH_MANAGER",
  EXECUTIVE: "EXECUTIVE",
  ADMIN: "ADMIN",
  COMPLIANCE_READONLY: "COMPLIANCE_READONLY",
} as const;

export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES];

export interface AuthUser {
  id: string;
  displayName: string;
  email: string;
  role: UserRole;
}

export const LEAD_STATUSES = [
  "PROSPECT",
  "CONTACTED",
  "QUALIFIED",
  "PROPOSAL",
  "WON",
  "LOST",
  "DORMANT",
] as const;

export const LEAD_SOURCES = ["REFERRAL", "WALK_IN", "PHONE", "WEBSITE", "EVENT", "EXISTING_CLIENT", "OTHER"] as const;

export const ACTIVITY_TYPES = ["CALL", "EMAIL", "MEETING", "NOTE", "FOLLOW_UP"] as const;

export const LEAD_DOCUMENT_CATEGORIES = ["TAX_RETURN", "FINANCIAL", "OTHER"] as const;
export type LeadDocumentCategory = (typeof LEAD_DOCUMENT_CATEGORIES)[number];

export const LEAD_DOCUMENT_CATEGORY_LABELS: Record<LeadDocumentCategory, string> = {
  TAX_RETURN: "Tax return",
  FINANCIAL: "Financials",
  OTHER: "Other",
};

export type LeadStatus = (typeof LEAD_STATUSES)[number];
export type LeadSource = (typeof LEAD_SOURCES)[number];
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

/** User-friendly labels (mom-friendly): maps pipeline enums to plain English. */
export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  PROSPECT: "New",
  CONTACTED: "Contacted",
  QUALIFIED: "Qualified",
  PROPOSAL: "In progress",
  WON: "Won",
  LOST: "Lost",
  DORMANT: "Dormant",
};

export function formatLeadStatus(status: LeadStatus): string {
  return LEAD_STATUS_LABELS[status];
}

export interface ApiUser {
  id: string;
  displayName: string;
  email: string;
  branch: string | null;
  role: UserRole;
}

export interface ApiActivity {
  id: string;
  type: ActivityType;
  subject: string;
  description: string | null;
  scheduledAt: string | null;
  completedAt: string | null;
  createdAt: string;
  userId: string;
  autoLogged?: boolean;
  user?: ApiUser;
}

export interface ApiLeadDocument {
  id: string;
  leadId: string;
  category: LeadDocumentCategory;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  blobPath: string;
  uploadedById: string;
  createdAt: string;
  uploadedBy?: ApiUser;
}

export interface ApiContact {
  id: string;
  leadId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  isPrimary: boolean;
  notes: string | null;
}

export interface ApiLead {
  id: string;
  firstName: string;
  lastName: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  industryCode: string | null;
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  latitude: number | null;
  longitude: number | null;
  source: LeadSource;
  status: LeadStatus;
  pipelineValue: string | number | null;
  notes: string | null;
  nextFollowUp: string | null;
  branch: string | null;
  assignedToId: string;
  assignedTo?: ApiUser;
  createdAt: string;
  updatedAt: string;
  activities?: ApiActivity[];
  contacts?: ApiContact[];
  documents?: ApiLeadDocument[];
}

export const TICKLER_RECURRENCES = ["NONE", "DAILY", "WEEKLY", "BIWEEKLY", "MONTHLY", "QUARTERLY"] as const;
export type TicklerRecurrence = (typeof TICKLER_RECURRENCES)[number];

export const TICKLER_RECURRENCE_LABELS: Record<TicklerRecurrence, string> = {
  NONE: "One-time",
  DAILY: "Daily",
  WEEKLY: "Weekly",
  BIWEEKLY: "Every 2 weeks",
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
};

export interface ApiTickler {
  id: string;
  leadId: string;
  ownerId: string;
  title: string;
  notes: string | null;
  dueAt: string;
  recurrence: TicklerRecurrence;
  completedAt: string | null;
  snoozedUntil: string | null;
  createdAt: string;
  lead?: { id: string; firstName: string; lastName: string; company: string | null };
  owner?: { id: string; displayName: string };
}

export type AutomationTrigger = "LEAD_STATUS_CHANGE" | "NO_ACTIVITY_DAYS" | "FOLLOW_UP_OVERDUE" | "LEAD_CREATED" | "LEAD_ASSIGNED";
export type AutomationAction = "SEND_NOTIFICATION" | "SEND_EMAIL" | "CREATE_TASK" | "CHANGE_STATUS" | "ASSIGN_LEAD";

export interface ApiNotification {
  id: string;
  title: string;
  message: string;
  link: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface ApiAutomation {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  trigger: AutomationTrigger;
  conditions: Record<string, unknown>;
  action: AutomationAction;
  actionConfig: Record<string, unknown>;
  updatedAt: string;
  _count?: { logs: number };
}
