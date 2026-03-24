import type { Lead } from "@prisma/client";
import { ActivityType, LeadSource, LeadStatus, UserRole } from "@prisma/client";

export interface AuthenticatedUser {
  id: string;
  entraId: string;
  email: string;
  displayName: string;
  role: UserRole;
  branch: string | null;
}

export interface ApiError {
  error: string;
  details?: string;
}

export interface LeadInput {
  firstName: string;
  lastName: string;
  company?: string;
  email?: string;
  phone?: string;
  industryCode?: string;
  addressLine1?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  latitude?: number;
  longitude?: number;
  source?: LeadSource;
  status?: LeadStatus;
  pipelineValue?: number;
  notes?: string;
  nextFollowUp?: string;
  branch?: string;
  assignedToId: string;
}

export interface ContactInput {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  title?: string;
  isPrimary?: boolean;
  notes?: string;
  leadId: string;
}

export interface ActivityInput {
  type: ActivityType;
  subject: string;
  description?: string;
  scheduledAt?: string;
  completedAt?: string;
  leadId: string;
}

export interface SearchRequestBody {
  query: string;
}

/** Response body for DELETE /leads/:id — soft archive, not a hard delete. */
export interface LeadArchiveResponse {
  action: "archived";
  lead: Lead;
}
