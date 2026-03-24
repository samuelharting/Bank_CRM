import { USER_ROLES, type UserRole } from "../types";

/** Matches backend `isReadOnlyRole` in API middleware. */
export function isReadOnlyRole(role: UserRole): boolean {
  return role === USER_ROLES.COMPLIANCE_READONLY;
}
