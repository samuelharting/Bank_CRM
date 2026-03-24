import type { UserRole } from "../types";

interface RoleBadgeProps {
  role: UserRole;
}

export function RoleBadge({ role }: RoleBadgeProps): JSX.Element {
  return (
    <span className="inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
      {role.replaceAll("_", " ")}
    </span>
  );
}
