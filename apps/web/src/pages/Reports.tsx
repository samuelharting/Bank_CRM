import { useCallback, useEffect, useState } from "react";
import { Download } from "lucide-react";
import { apiFetch } from "../lib/api";
import { useAuth } from "../auth/useAuth";
import { ToastContainer, type ToastMessage } from "../components/Toast";
import { USER_ROLES, formatLeadStatus, type LeadStatus } from "../types";

type ReportName = "pipeline" | "conversion" | "activity" | "stale";

const REPORT_TABS: { key: ReportName; label: string }[] = [
  { key: "pipeline", label: "Pipeline by officer" },
  { key: "conversion", label: "Conversion" },
  { key: "activity", label: "Activity volume" },
  { key: "stale", label: "Stale leads" },
];

interface PipelineRow {
  officerId: string;
  displayName: string;
  branch: string | null;
  count: number;
  totalPipeline: number;
}

interface ConversionData {
  days: number;
  totalLeads: number;
  wonCount: number;
  conversionRate: number;
  byStatus: { status: string; count: number; pipeline: number }[];
}

interface ActivityRow {
  officerId: string;
  displayName: string;
  CALL: number;
  EMAIL: number;
  MEETING: number;
  NOTE: number;
  FOLLOW_UP: number;
  total: number;
}

interface StaleRow {
  id: string;
  name: string;
  company: string | null;
  status: string;
  pipelineValue: number;
  assignedTo: string;
  branch: string | null;
  lastActivity: string | null;
  updatedAt: string;
}

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const downloadCsv = (filename: string, header: string[], rows: string[][]): void => {
  const csv = [header, ...rows]
    .map((row) => row.map((v) => `"${String(v).replaceAll("\"", "\"\"")}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
};

export function Reports(): JSX.Element {
  const { role } = useAuth();
  const [tab, setTab] = useState<ReportName>("pipeline");
  const [days, setDays] = useState(90);
  const [branch, setBranch] = useState("");
  const [loading, setLoading] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const [pipelineRows, setPipelineRows] = useState<PipelineRow[]>([]);
  const [conversionData, setConversionData] = useState<ConversionData | null>(null);
  const [activityRows, setActivityRows] = useState<ActivityRow[]>([]);
  const [activityDays, setActivityDays] = useState(30);
  const [staleRows, setStaleRows] = useState<StaleRow[]>([]);
  const [staleDays, setStaleDays] = useState(14);

  const addToast = useCallback((type: ToastMessage["type"], message: string) => {
    setToasts((prev) => [...prev, { id: Date.now() + Math.random(), type, message }]);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const canView =
    role === USER_ROLES.BRANCH_MANAGER ||
    role === USER_ROLES.EXECUTIVE ||
    role === USER_ROLES.ADMIN ||
    role === USER_ROLES.COMPLIANCE_READONLY;

  const qs = branch ? `&branch=${encodeURIComponent(branch)}` : "";

  const loadPipeline = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<{ rows: PipelineRow[] }>(`/reports/pipeline-by-officer?${qs}`);
      setPipelineRows(data.rows);
    } catch (e) {
      addToast("error", e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }, [addToast, qs]);

  const loadConversion = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<ConversionData>(`/reports/conversion?days=${days}${qs}`);
      setConversionData(data);
    } catch (e) {
      addToast("error", e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }, [addToast, days, qs]);

  const loadActivity = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<{ days: number; rows: ActivityRow[] }>(`/reports/activity-volume?days=${activityDays}${qs}`);
      setActivityRows(data.rows);
    } catch (e) {
      addToast("error", e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }, [addToast, activityDays, qs]);

  const loadStale = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<{ days: number; rows: StaleRow[] }>(`/reports/stale-leads?days=${staleDays}${qs}`);
      setStaleRows(data.rows);
    } catch (e) {
      addToast("error", e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }, [addToast, staleDays, qs]);

  useEffect(() => {
    if (!canView) return;
    if (tab === "pipeline") loadPipeline().catch(() => undefined);
    else if (tab === "conversion") loadConversion().catch(() => undefined);
    else if (tab === "activity") loadActivity().catch(() => undefined);
    else if (tab === "stale") loadStale().catch(() => undefined);
  }, [canView, tab, loadPipeline, loadConversion, loadActivity, loadStale]);

  if (!canView) {
    return (
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold text-slate-900">Reports</h2>
        <p className="text-sm text-slate-600">Reports are available to branch managers, executives, admins, and compliance.</p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      <h2 className="text-2xl font-semibold text-slate-900">Reports</h2>

      <div className="flex flex-wrap gap-1 border-b border-slate-200">
        {REPORT_TABS.map((r) => (
          <button
            key={r.key}
            onClick={() => setTab(r.key)}
            className={`relative px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === r.key
                ? "text-blue-700 after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-blue-600 after:rounded-full"
                : "text-slate-500 hover:text-slate-900"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <span className="font-medium">Branch</span>
          <input
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            placeholder="All branches"
            className="w-40 rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </label>
      </div>

      {loading && (
        <div className="space-y-3">
          <div className="h-12 animate-pulse rounded-xl bg-slate-100" />
          <div className="h-64 animate-pulse rounded-xl bg-slate-100" />
        </div>
      )}

      {tab === "pipeline" && !loading && (
        <div className="overflow-auto rounded-xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between px-4 py-3">
            <p className="text-sm font-semibold text-slate-800">Active pipeline by assigned officer</p>
            <button
              onClick={() =>
                downloadCsv(
                  "pipeline-by-officer.csv",
                  ["Officer", "Branch", "Active leads", "Pipeline total"],
                  pipelineRows.map((r) => [r.displayName, r.branch ?? "", String(r.count), String(r.totalPipeline)]),
                )
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition-colors"
            >
              <Download className="h-3.5 w-3.5" /> CSV
            </button>
          </div>
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-2 text-left font-semibold text-slate-700">Officer</th>
                <th className="px-4 py-2 text-left font-semibold text-slate-700">Branch</th>
                <th className="px-4 py-2 text-right font-semibold text-slate-700">Active leads</th>
                <th className="px-4 py-2 text-right font-semibold text-slate-700">Pipeline $</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pipelineRows.map((r) => (
                <tr key={r.officerId}>
                  <td className="px-4 py-2 text-slate-900">{r.displayName}</td>
                  <td className="px-4 py-2 text-slate-600">{r.branch ?? "—"}</td>
                  <td className="px-4 py-2 text-right text-slate-600">{r.count}</td>
                  <td className="px-4 py-2 text-right font-medium text-slate-900">{currency.format(r.totalPipeline)}</td>
                </tr>
              ))}
              {pipelineRows.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-500">No data</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === "conversion" && !loading && conversionData && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <label className="text-sm text-slate-700">
              Lookback
              <select
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
                className="ml-2 rounded-md border border-gray-300 px-2 py-1 text-sm"
              >
                <option value={30}>30 days</option>
                <option value={60}>60 days</option>
                <option value={90}>90 days</option>
                <option value={180}>180 days</option>
                <option value={365}>1 year</option>
              </select>
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-4 text-center">
              <p className="text-3xl font-bold text-slate-900">{conversionData.totalLeads}</p>
              <p className="text-sm text-slate-500">Leads created (last {conversionData.days}d)</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 text-center">
              <p className="text-3xl font-bold text-green-700">{conversionData.wonCount}</p>
              <p className="text-sm text-slate-500">Won</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 text-center">
              <p className="text-3xl font-bold text-blue-700">{conversionData.conversionRate}%</p>
              <p className="text-sm text-slate-500">Conversion rate</p>
            </div>
          </div>
          <div className="overflow-auto rounded-xl border border-slate-200 bg-white">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold text-slate-700">Status</th>
                  <th className="px-4 py-2 text-right font-semibold text-slate-700">Count</th>
                  <th className="px-4 py-2 text-right font-semibold text-slate-700">Pipeline $</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {conversionData.byStatus.map((s) => (
                  <tr key={s.status}>
                    <td className="px-4 py-2 text-slate-900">{formatLeadStatus(s.status as LeadStatus)}</td>
                    <td className="px-4 py-2 text-right text-slate-600">{s.count}</td>
                    <td className="px-4 py-2 text-right font-medium text-slate-900">{currency.format(s.pipeline)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "activity" && !loading && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <label className="text-sm text-slate-700">
              Lookback
              <select
                value={activityDays}
                onChange={(e) => setActivityDays(Number(e.target.value))}
                className="ml-2 rounded-md border border-gray-300 px-2 py-1 text-sm"
              >
                <option value={7}>7 days</option>
                <option value={14}>14 days</option>
                <option value={30}>30 days</option>
                <option value={60}>60 days</option>
                <option value={90}>90 days</option>
              </select>
            </label>
          </div>
          <div className="overflow-auto rounded-xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between px-4 py-3">
              <p className="text-sm font-semibold text-slate-800">Activity count by officer</p>
              <button
                onClick={() =>
                  downloadCsv(
                    "activity-volume.csv",
                    ["Officer", "Calls", "Emails", "Meetings", "Notes", "Follow-ups", "Total"],
                    activityRows.map((r) => [r.displayName, String(r.CALL), String(r.EMAIL), String(r.MEETING), String(r.NOTE), String(r.FOLLOW_UP), String(r.total)]),
                  )
                }
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition-colors"
              >
                <Download className="h-3.5 w-3.5" /> CSV
              </button>
            </div>
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold text-slate-700">Officer</th>
                  <th className="px-4 py-2 text-right font-semibold text-slate-700">Calls</th>
                  <th className="px-4 py-2 text-right font-semibold text-slate-700">Emails</th>
                  <th className="px-4 py-2 text-right font-semibold text-slate-700">Meetings</th>
                  <th className="px-4 py-2 text-right font-semibold text-slate-700">Notes</th>
                  <th className="px-4 py-2 text-right font-semibold text-slate-700">Follow-ups</th>
                  <th className="px-4 py-2 text-right font-semibold text-slate-700">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {activityRows.map((r) => (
                  <tr key={r.officerId}>
                    <td className="px-4 py-2 text-slate-900">{r.displayName}</td>
                    <td className="px-4 py-2 text-right text-slate-600">{r.CALL}</td>
                    <td className="px-4 py-2 text-right text-slate-600">{r.EMAIL}</td>
                    <td className="px-4 py-2 text-right text-slate-600">{r.MEETING}</td>
                    <td className="px-4 py-2 text-right text-slate-600">{r.NOTE}</td>
                    <td className="px-4 py-2 text-right text-slate-600">{r.FOLLOW_UP}</td>
                    <td className="px-4 py-2 text-right font-medium text-slate-900">{r.total}</td>
                  </tr>
                ))}
                {activityRows.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-500">No activity data</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "stale" && !loading && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <label className="text-sm text-slate-700">
              No activity in
              <select
                value={staleDays}
                onChange={(e) => setStaleDays(Number(e.target.value))}
                className="ml-2 rounded-md border border-gray-300 px-2 py-1 text-sm"
              >
                <option value={7}>7 days</option>
                <option value={14}>14 days</option>
                <option value={30}>30 days</option>
                <option value={60}>60 days</option>
              </select>
            </label>
          </div>
          <div className="overflow-auto rounded-xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between px-4 py-3">
              <p className="text-sm font-semibold text-slate-800">Leads going stale ({staleRows.length})</p>
              <button
                onClick={() =>
                  downloadCsv(
                    "stale-leads.csv",
                    ["Name", "Company", "Status", "Pipeline", "Officer", "Branch", "Last Activity", "Updated"],
                    staleRows.map((r) => [
                      r.name,
                      r.company ?? "",
                      r.status,
                      String(r.pipelineValue),
                      r.assignedTo,
                      r.branch ?? "",
                      r.lastActivity ? new Date(r.lastActivity).toISOString() : "",
                      new Date(r.updatedAt).toISOString(),
                    ]),
                  )
                }
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition-colors"
              >
                <Download className="h-3.5 w-3.5" /> CSV
              </button>
            </div>
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold text-slate-700">Prospect</th>
                  <th className="px-4 py-2 text-left font-semibold text-slate-700">Status</th>
                  <th className="px-4 py-2 text-right font-semibold text-slate-700">Pipeline</th>
                  <th className="px-4 py-2 text-left font-semibold text-slate-700">Officer</th>
                  <th className="px-4 py-2 text-left font-semibold text-slate-700">Last activity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {staleRows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-2">
                      <p className="font-medium text-slate-900">{r.name}</p>
                      <p className="text-xs text-slate-500">{r.company ?? ""}</p>
                    </td>
                    <td className="px-4 py-2 text-slate-600">{formatLeadStatus(r.status as LeadStatus)}</td>
                    <td className="px-4 py-2 text-right text-slate-600">{currency.format(r.pipelineValue)}</td>
                    <td className="px-4 py-2 text-slate-600">{r.assignedTo}</td>
                    <td className="px-4 py-2 text-slate-500 text-xs">{r.lastActivity ? new Date(r.lastActivity).toLocaleString() : "Never"}</td>
                  </tr>
                ))}
                {staleRows.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-500">No stale leads</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
