import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { apiFetch } from "../lib/api";
import { resolveApiBaseUrl } from "../lib/apiBaseUrl";
import { USER_ROLES } from "../types";
import { useTour } from "../tour/TourProvider";

const BRANCH_OPTIONS = ["ALL", "Baxter", "Bemidji", "Brainerd", "Deerwood", "Garrison", "Grand Rapids", "Hibbing", "Isle", "Nisswa", "Pequot Lakes", "Pine River", "Walker", "Crosby"];
const LEADS_PER_PAGE_OPTIONS = [25, 50, 100];

interface LocalPreferences {
  defaultBranchFilter: string;
  emailSyncNotifications: boolean;
  automationNotifications: boolean;
  leadsPerPage: number;
}

const defaultPreferences: LocalPreferences = {
  defaultBranchFilter: "ALL",
  emailSyncNotifications: true,
  automationNotifications: true,
  leadsPerPage: 25,
};

export function Settings(): JSX.Element {
  const { user, role } = useAuth();
  const tour = useTour();
  const [prefs, setPrefs] = useState<LocalPreferences>(defaultPreferences);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [healthStatus, setHealthStatus] = useState<"connected" | "unavailable" | "loading">("loading");
  const [adminStats, setAdminStats] = useState<{ users: number; leads: number; activities: number } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const diagnosticsRef = useRef<HTMLDetailsElement>(null);
  const adminStatsRef = useRef<HTMLDetailsElement>(null);
  const apiUrl = resolveApiBaseUrl(import.meta.env.VITE_API_URL);

  useEffect(() => {
    const stored = localStorage.getItem("crm-settings");
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored) as Partial<LocalPreferences>;
      setPrefs({ ...defaultPreferences, ...parsed });
    } catch {
      setPrefs(defaultPreferences);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("crm-settings", JSON.stringify(prefs));
  }, [prefs]);

  useEffect(() => {
    apiFetch<{ lastSyncAt: string | null }>("/emails/sync-status")
      .then((data) => setLastSyncAt(data.lastSyncAt))
      .catch(() => setLastSyncAt(null));
    apiFetch<{ status: string }>("/health")
      .then((data) => setHealthStatus(data.status === "ok" ? "connected" : "unavailable"))
      .catch(() => setHealthStatus("unavailable"));
  }, []);

  useEffect(() => {
    if (role !== USER_ROLES.ADMIN) return;
    Promise.all([
      apiFetch<Array<{ id: string }>>("/users"),
      apiFetch<{ total: number }>("/leads?page=1&pageSize=1"),
      apiFetch<{ total: number }>("/activities?page=1&pageSize=1"),
    ])
      .then(([users, leads, activities]) =>
        setAdminStats({
          users: users.length,
          leads: leads.total,
          activities: activities.total,
        }),
      )
      .catch(() => setAdminStats(null));
  }, [role]);

  useEffect(() => {
    const openDiagnostics = () => {
      if (diagnosticsRef.current) diagnosticsRef.current.open = true;
    };
    const closeDiagnostics = () => {
      if (diagnosticsRef.current) diagnosticsRef.current.open = false;
    };
    const openAdminStats = () => {
      if (adminStatsRef.current) adminStatsRef.current.open = true;
    };
    const closeAdminStats = () => {
      if (adminStatsRef.current) adminStatsRef.current.open = false;
    };
    window.addEventListener("crm-demo-open-settings-diagnostics", openDiagnostics);
    window.addEventListener("crm-demo-close-settings-diagnostics", closeDiagnostics);
    window.addEventListener("crm-demo-open-settings-admin-stats", openAdminStats);
    window.addEventListener("crm-demo-close-settings-admin-stats", closeAdminStats);
    return () => {
      window.removeEventListener("crm-demo-open-settings-diagnostics", openDiagnostics);
      window.removeEventListener("crm-demo-close-settings-diagnostics", closeDiagnostics);
      window.removeEventListener("crm-demo-open-settings-admin-stats", openAdminStats);
      window.removeEventListener("crm-demo-close-settings-admin-stats", closeAdminStats);
    };
  }, []);

  const runEmailSync = async (): Promise<void> => {
    setSyncing(true);
    try {
      await apiFetch("/emails/manual-sync", { method: "POST" });
      const status = await apiFetch<{ lastSyncAt: string | null }>("/emails/sync-status");
      setLastSyncAt(status.lastSyncAt);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold text-slate-900">Settings</h2>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h3 className="text-lg font-semibold text-slate-900">Profile</h3>
        <div className="mt-3 space-y-2 text-sm text-slate-700">
          <p>
            <span className="font-semibold">Name:</span> {user?.displayName ?? "Unknown"}
          </p>
          <p>
            <span className="font-semibold">Email:</span> {user?.email ?? "Unknown"}
          </p>
          <p>
            <span className="font-semibold">Role:</span> {role}
          </p>
        </div>
      </div>

      <div data-tour="settings-preferences" className="rounded-xl border border-slate-200 bg-white p-5">
        <h3 className="text-lg font-semibold text-slate-900">Preferences</h3>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">
            Default branch filter
            <select
              value={prefs.defaultBranchFilter}
              onChange={(e) => setPrefs((prev) => ({ ...prev, defaultBranchFilter: e.target.value }))}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              {BRANCH_OPTIONS.map((branch) => (
                <option key={branch} value={branch}>
                  {branch}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm font-medium text-slate-700">
            Default leads per page
            <select
              value={String(prefs.leadsPerPage)}
              onChange={(e) => setPrefs((prev) => ({ ...prev, leadsPerPage: Number(e.target.value) }))}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              {LEADS_PER_PAGE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-4 space-y-2 text-sm text-slate-700">
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={prefs.emailSyncNotifications}
              onChange={(e) => setPrefs((prev) => ({ ...prev, emailSyncNotifications: e.target.checked }))}
            />
            Email sync notifications
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={prefs.automationNotifications}
              onChange={(e) => setPrefs((prev) => ({ ...prev, automationNotifications: e.target.checked }))}
            />
            Automation notifications
          </label>
        </div>
      </div>

      <div data-demo="settings-tour" className="rounded-xl border border-slate-200 bg-white p-5">
        <h3 className="text-lg font-semibold text-slate-900">Guided Tour</h3>
        <p className="mt-1 text-sm text-slate-600">Take or restart the interactive product walkthrough.</p>
        <div className="mt-3 flex gap-2">
          <button onClick={() => tour.start()} className="rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700">
            Start Tour
          </button>
          <button onClick={() => tour.reset()} className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
            Reset Tour
          </button>
        </div>
      </div>

      <details ref={diagnosticsRef} data-demo="settings-diagnostics" className="rounded-xl border border-slate-200 bg-white">
        <summary className="cursor-pointer px-5 py-4 text-sm font-semibold text-slate-700">
          Diagnostics & App Info
          <span className="ml-2 inline-flex items-center gap-1.5 text-xs font-normal text-slate-500">
            <span className={`h-2 w-2 rounded-full ${healthStatus === "connected" ? "bg-green-500" : healthStatus === "unavailable" ? "bg-red-500" : "bg-slate-300"}`} />
            {healthStatus === "connected" ? "Connected" : healthStatus === "unavailable" ? "Unavailable" : "Checking…"}
          </span>
        </summary>
        <div className="space-y-2 border-t border-slate-100 px-5 pb-5 pt-3 text-sm text-slate-700">
          <p><span className="font-semibold">Version:</span> 1.0.0-beta</p>
          <p><span className="font-semibold">API:</span> {apiUrl}</p>
          <p><span className="font-semibold">Last email sync:</span> {lastSyncAt ? new Date(lastSyncAt).toLocaleString() : "Not synced yet"}</p>
        </div>
      </details>

      {role === USER_ROLES.ADMIN && (
        <details ref={adminStatsRef} data-demo="settings-admin-stats" className="rounded-xl border border-slate-200 bg-white">
          <summary className="cursor-pointer px-5 py-4 text-sm font-semibold text-slate-700">Admin Controls</summary>
          <div className="border-t border-slate-100 px-5 pb-5 pt-3">
            <div className="flex flex-wrap gap-3">
              <Link to="/automations" className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                Open Automations
              </Link>
              <button
                data-demo="settings-email-sync"
                onClick={() => runEmailSync().catch(() => undefined)}
                disabled={syncing}
                className="rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {syncing ? "Running..." : "Run Email Sync Now"}
              </button>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <div className="rounded-md bg-slate-50 p-3 text-sm">
                <p className="text-slate-500">Users</p>
                <p className="text-lg font-semibold text-slate-900">{adminStats?.users ?? "—"}</p>
              </div>
              <div className="rounded-md bg-slate-50 p-3 text-sm">
                <p className="text-slate-500">Leads</p>
                <p className="text-lg font-semibold text-slate-900">{adminStats?.leads ?? "—"}</p>
              </div>
              <div className="rounded-md bg-slate-50 p-3 text-sm">
                <p className="text-slate-500">Activities</p>
                <p className="text-lg font-semibold text-slate-900">{adminStats?.activities ?? "—"}</p>
              </div>
            </div>
          </div>
        </details>
      )}
    </section>
  );
}
