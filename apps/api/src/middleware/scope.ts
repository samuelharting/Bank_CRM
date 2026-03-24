import { Prisma, UserRole } from "@prisma/client";
import { AuthenticatedUser } from "../types/index.js";

export const isReadOnlyRole = (role: UserRole): boolean => role === UserRole.COMPLIANCE_READONLY;

export const leadScopeWhere = (user: AuthenticatedUser): Prisma.LeadWhereInput => {
  if (user.role === UserRole.SALES_REP) {
    return { assignedToId: user.id };
  }

  if (user.role === UserRole.BRANCH_MANAGER) {
    if (!user.branch) {
      return { id: "__no_branch_access__" };
    }
    return { branch: user.branch };
  }

  return {};
};

export const activityScopeWhere = (user: AuthenticatedUser): Prisma.ActivityWhereInput => ({
  lead: leadScopeWhere(user),
});
