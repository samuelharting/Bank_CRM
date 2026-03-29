import { Bell } from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { apiFetch } from "../lib/api";
import { USER_ROLES } from "../types";
import type { ApiNotification } from "../types";
import { RoleBadge } from "./RoleBadge";
import { Activity, BarChart3, Clock, FileSpreadsheet, LayoutDashboard, MapPin, Menu, Settings, Target, Users, X, Zap, ExternalLink } from "lucide-react";
import { isInTeams, openInBrowser } from "../lib/teams";
import { isReadOnlyRole } from "../lib/roles";

interface NavItem { to: string; label: string; icon: typeof LayoutDashboard }
interface NavGroup { label: string; items: NavItem[] }

const coreNavItems: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/leads", label: "Leads", icon: Target },
  { to: "/contacts", label: "Contacts", icon: Users },
  { to: "/activities", label: "Activities", icon: Activity },
];

export function Layout(): JSX.Element {
  const { user, role, logout } = useAuth();
  const navigate = useNavigate();
  const [openNotifications, setOpenNotifications] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<ApiNotification[]>([]);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(isInTeams());
  const teamsMode = isInTeams();

  const toolsItems: NavItem[] = [];
  if (!isReadOnlyRole(role)) toolsItems.push({ to: "/ticklers", label: "Ticklers", icon: Clock });
  toolsItems.push({ to: "/map", label: "Map", icon: MapPin });
  if (!isReadOnlyRole(role)) toolsItems.push({ to: "/import/leads", label: "Import", icon: FileSpreadsheet });

  const adminItems: NavItem[] = [];
  if (role === USER_ROLES.BRANCH_MANAGER || role === USER_ROLES.EXECUTIVE || role === USER_ROLES.ADMIN || role === USER_ROLES.COMPLIANCE_READONLY) {
    adminItems.push({ to: "/reports", label: "Reports", icon: BarChart3 });
  }
  if (role === USER_ROLES.ADMIN) {
    adminItems.push({ to: "/automations", label: "Automations", icon: Zap });
  }

  const navGroups: NavGroup[] = [{ label: "", items: coreNavItems }];
  if (toolsItems.length > 0) navGroups.push({ label: "Tools", items: toolsItems });
  if (adminItems.length > 0) navGroups.push({ label: "Reporting", items: adminItems });

  useEffect(() => {
    const loadCount = async (): Promise<void> => {
      const response = await apiFetch<{ unread: number }>("/notifications/count");
      setUnreadCount(response.unread);
    };
    loadCount().catch(() => undefined);
    const interval = window.setInterval(() => {
      loadCount().catch(() => undefined);
    }, 30000);
    return () => window.clearInterval(interval);
  }, []);

  const openBell = async (): Promise<void> => {
    const response = await apiFetch<{ notifications: ApiNotification[] }>("/notifications");
    setNotifications(response.notifications);
    setOpenNotifications((prev) => !prev);
  };

  const markAllRead = async (): Promise<void> => {
    await apiFetch("/notifications/read-all", { method: "PUT" });
    setNotifications((prev) => prev.map((item) => ({ ...item, isRead: true })));
    setUnreadCount(0);
  };

  const markRead = async (notification: ApiNotification): Promise<void> => {
    await apiFetch(`/notifications/${notification.id}/read`, { method: "PUT" });
    setNotifications((prev) => prev.map((item) => (item.id === notification.id ? { ...item, isRead: true } : item)));
    setUnreadCount((prev) => Math.max(0, prev - (notification.isRead ? 0 : 1)));
    if (notification.link) navigate(notification.link);
  };

  return (
    <div className="flex min-h-screen bg-slate-50">
      <button className="fixed left-3 top-3 z-50 rounded-md bg-slate-900 p-2 text-white md:hidden" onClick={() => setMobileSidebarOpen(true)}>
        <Menu className="h-5 w-5" />
      </button>
      <aside className={`${mobileSidebarOpen ? "translate-x-0" : "-translate-x-full"} fixed inset-y-0 left-0 z-50 ${collapsed ? "w-20" : "w-64"} transform bg-slate-900 p-4 text-slate-100 transition-all md:static md:translate-x-0`}>
        <div className="mb-6 flex items-center justify-between">
          <button className="rounded-md p-2 text-slate-300 hover:bg-slate-800 md:hidden" onClick={() => setMobileSidebarOpen(false)}>
            <X className="h-4 w-4" />
          </button>
          <button className="hidden rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-400 hover:text-slate-200 md:block" onClick={() => setCollapsed((prev) => !prev)}>
            {collapsed ? "→" : "←"}
          </button>
        </div>
        <div className="mb-2 flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white">DB</div>
          {!collapsed && (
            <div>
              <h1 className="text-base font-bold tracking-tight">Deerwood Bank</h1>
              <p className="text-xs text-slate-400">CRM · Sales Platform</p>
            </div>
          )}
        </div>
        <nav className="mt-6 space-y-4">
          {navGroups.map((group) => (
            <div key={group.label}>
              {group.label && !collapsed && (
                <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest text-slate-500">{group.label}</p>
              )}
              {group.label && collapsed && <div className="mx-3 mb-1 border-t border-slate-700" />}
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => setMobileSidebarOpen(false)}
                    className={({ isActive }) =>
                      `flex min-h-10 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${isActive ? "bg-blue-600/90 text-white shadow-sm" : "text-slate-300 hover:bg-slate-800 hover:text-white"}`
                    }
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {!collapsed && item.label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="mt-4 border-t border-slate-800 pt-4">
          <NavLink to="/settings" className={({ isActive }) => `flex min-h-10 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${isActive ? "bg-blue-600/90 text-white shadow-sm" : "text-slate-300 hover:bg-slate-800 hover:text-white"}`}>
            <Settings className="h-4 w-4 shrink-0" />
            {!collapsed && "Settings"}
          </NavLink>
        </div>
        {teamsMode && !collapsed && (
          <button onClick={() => openInBrowser(window.location.origin)} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800">
            <ExternalLink className="h-4 w-4" /> Pop out
          </button>
        )}
        <button
          onClick={() => logout()}
          className="mt-8 min-h-11 rounded-md border border-slate-600 px-3 py-2 text-sm text-slate-100 hover:bg-slate-800"
        >
          {!teamsMode ? "Sign Out" : "Sign Out disabled in Teams"}
        </button>
      </aside>
      <div className="flex-1">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 shadow-sm md:px-6 md:py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-600">
              {(user?.displayName ?? "U").split(" ").map(n => n[0]).join("").slice(0, 2)}
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">{user?.displayName ?? "Bank User"}</p>
              <p className="text-xs text-slate-500">{user?.email ?? "user@deerwoodbank.com"}</p>
            </div>
          </div>
          <div className="relative flex items-center gap-3">
            <button
              onClick={() => openBell().catch(() => undefined)}
              className="relative rounded-full p-2 text-slate-600 hover:bg-slate-100"
            >
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
                  {unreadCount}
                </span>
              )}
            </button>
            {openNotifications && (
              <div className="absolute right-0 top-11 z-50 w-96 rounded-lg border border-slate-200 bg-white shadow-lg">
                <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
                  <p className="text-sm font-semibold text-slate-900">Notifications</p>
                  <button onClick={() => markAllRead().catch(() => undefined)} className="text-xs text-blue-600 hover:underline">
                    Mark all as read
                  </button>
                </div>
                <div className="max-h-96 overflow-y-auto">
                  {notifications.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => markRead(item).catch(() => undefined)}
                      className={`block w-full border-b border-slate-100 px-3 py-3 text-left hover:bg-slate-50 ${item.isRead ? "opacity-70" : ""}`}
                    >
                      <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                      <p className="mt-1 text-xs text-slate-600">{item.message}</p>
                      <p className="mt-1 text-[11px] text-slate-400">{new Date(item.createdAt).toLocaleString()}</p>
                    </button>
                  ))}
                  {!notifications.length && <p className="px-3 py-6 text-sm text-slate-500">No notifications yet.</p>}
                </div>
              </div>
            )}
            {!teamsMode && <RoleBadge role={role} />}
          </div>
        </header>
        <main className={`${teamsMode ? "p-3 md:p-4" : "p-4 md:p-6"}`}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
