import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { isReadOnlyRole } from "../lib/roles";
import { useAuth } from "../auth/useAuth";
import { LEAD_SOURCES, LEAD_STATUSES, USER_ROLES, type ApiAutomation, type ApiUser, type AutomationAction, type AutomationTrigger } from "../types";

const triggers: AutomationTrigger[] = ["NO_ACTIVITY_DAYS", "FOLLOW_UP_OVERDUE", "LEAD_STATUS_CHANGE", "LEAD_CREATED", "LEAD_ASSIGNED"];
const actions: AutomationAction[] = ["SEND_NOTIFICATION", "CREATE_TASK", "CHANGE_STATUS", "ASSIGN_LEAD"];

export function Automations(): JSX.Element {
  const { role } = useAuth();

  if (isReadOnlyRole(role)) {
    return (
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900">Automations</h2>
        <p className="text-sm text-slate-600">Your role does not have access to automations.</p>
        <Link to="/dashboard" className="text-blue-600 hover:underline">
          Back to Dashboard
        </Link>
      </section>
    );
  }
  const [automations, setAutomations] = useState<ApiAutomation[]>([]);
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [logs, setLogs] = useState<Array<{ id: string; status: string; message: string | null; executedAt: string }>>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
    trigger: "NO_ACTIVITY_DAYS" as AutomationTrigger,
    action: "SEND_NOTIFICATION" as AutomationAction,
    conditions: {} as Record<string, unknown>,
    actionConfig: {} as Record<string, unknown>,
  });

  const loadData = async (): Promise<void> => {
    setLoading(true);
    try {
      const [automationRes, userRes] = await Promise.all([
        apiFetch<{ automations: ApiAutomation[] }>("/automations"),
        apiFetch<ApiUser[]>("/users"),
      ]);
      setAutomations(automationRes.automations);
      setUsers(userRes);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData().catch(() => undefined);
  }, []);

  useEffect(() => {
    const openFirstAutomation = () => {
      if (automations[0]) {
        loadLogs(automations[0].id).catch(() => undefined);
      }
    };
    const closeLogs = () => {
      setSelectedId(null);
      setLogs([]);
    };
    window.addEventListener("crm-demo-open-first-automation", openFirstAutomation);
    window.addEventListener("crm-demo-close-automation-logs", closeLogs);
    return () => {
      window.removeEventListener("crm-demo-open-first-automation", openFirstAutomation);
      window.removeEventListener("crm-demo-close-automation-logs", closeLogs);
    };
  }, [automations]);

  const selectedAutomation = useMemo(() => automations.find((item) => item.id === selectedId) ?? null, [automations, selectedId]);

  const loadLogs = async (id: string): Promise<void> => {
    setSelectedId(id);
    const response = await apiFetch<{ logs: Array<{ id: string; status: string; message: string | null; executedAt: string }> }>(
      `/automations/${id}/logs`,
    );
    setLogs(response.logs);
  };

  const saveAutomation = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    await apiFetch("/automations", {
      method: "POST",
      body: JSON.stringify(form),
    });
    setShowForm(false);
    setForm({
      name: "",
      description: "",
      trigger: "NO_ACTIVITY_DAYS",
      action: "SEND_NOTIFICATION",
      conditions: {},
      actionConfig: {},
    });
    await loadData();
  };

  const toggleActive = async (automation: ApiAutomation): Promise<void> => {
    await apiFetch(`/automations/${automation.id}`, {
      method: "PUT",
      body: JSON.stringify({ isActive: !automation.isActive }),
    });
    await loadData();
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold text-slate-900">Automations</h2>
        <button data-demo="automations-create" onClick={() => setShowForm(true)} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
          Create Automation
        </button>
      </div>

      {showForm && (
        <form onSubmit={saveAutomation} className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
          <h3 className="text-lg font-semibold text-slate-900">Create Automation</h3>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm font-medium text-gray-700">
              Name
              <input value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" required />
            </label>
            <label className="text-sm font-medium text-gray-700">
              Description
              <input value={form.description} onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </label>
          </div>

          <fieldset className="rounded-lg border border-slate-200 p-3">
            <legend className="px-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Trigger</legend>
            <select value={form.trigger} onChange={(e) => setForm((prev) => ({ ...prev, trigger: e.target.value as AutomationTrigger }))} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500">
              {triggers.map((trigger) => (
                <option key={trigger} value={trigger}>{trigger}</option>
              ))}
            </select>
            <div className="mt-3 space-y-2">
              {form.trigger === "NO_ACTIVITY_DAYS" && (
                <div className="grid gap-2 md:grid-cols-3">
                  <input type="number" placeholder="Days inactive" className="rounded-md border border-gray-300 px-3 py-2 text-sm" onChange={(e) => setForm((prev) => ({ ...prev, conditions: { ...prev.conditions, days: Number(e.target.value) } }))} />
                  <select multiple className="rounded-md border border-gray-300 px-3 py-2 text-sm" onChange={(e) => setForm((prev) => ({ ...prev, conditions: { ...prev.conditions, statuses: Array.from(e.target.selectedOptions).map((o) => o.value) } }))}>
                    {LEAD_STATUSES.map((status) => <option key={status}>{status}</option>)}
                  </select>
                  <input placeholder="Branches (comma separated)" className="rounded-md border border-gray-300 px-3 py-2 text-sm" onBlur={(e) => setForm((prev) => ({ ...prev, conditions: { ...prev.conditions, branches: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) } }))} />
                </div>
              )}
              {form.trigger === "FOLLOW_UP_OVERDUE" && (
                <input type="number" placeholder="Grace period (hours)" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" onChange={(e) => setForm((prev) => ({ ...prev, conditions: { gracePeriodHours: Number(e.target.value) } }))} />
              )}
              {form.trigger === "LEAD_STATUS_CHANGE" && (
                <div className="grid gap-2 md:grid-cols-2">
                  <select className="rounded-md border border-gray-300 px-3 py-2 text-sm" onChange={(e) => setForm((prev) => ({ ...prev, conditions: { ...prev.conditions, fromStatus: e.target.value } }))}>
                    <option value="">From status…</option>
                    {LEAD_STATUSES.map((status) => <option key={status}>{status}</option>)}
                  </select>
                  <select className="rounded-md border border-gray-300 px-3 py-2 text-sm" onChange={(e) => setForm((prev) => ({ ...prev, conditions: { ...prev.conditions, toStatus: e.target.value } }))}>
                    <option value="">To status…</option>
                    {LEAD_STATUSES.map((status) => <option key={status}>{status}</option>)}
                  </select>
                </div>
              )}
              {form.trigger === "LEAD_CREATED" && (
                <div className="grid gap-2 md:grid-cols-2">
                  <select multiple className="rounded-md border border-gray-300 px-3 py-2 text-sm" onChange={(e) => setForm((prev) => ({ ...prev, conditions: { ...prev.conditions, sources: Array.from(e.target.selectedOptions).map((o) => o.value) } }))}>
                    {LEAD_SOURCES.map((source) => <option key={source}>{source}</option>)}
                  </select>
                  <input type="number" placeholder="Minimum value" className="rounded-md border border-gray-300 px-3 py-2 text-sm" onChange={(e) => setForm((prev) => ({ ...prev, conditions: { ...prev.conditions, minimumValue: Number(e.target.value) } }))} />
                </div>
              )}
            </div>
          </fieldset>

          <fieldset className="rounded-lg border border-slate-200 p-3">
            <legend className="px-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Action</legend>
            <select value={form.action} onChange={(e) => setForm((prev) => ({ ...prev, action: e.target.value as AutomationAction }))} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500">
              {actions.map((action) => <option key={action} value={action}>{action}</option>)}
              <option value="SEND_EMAIL" disabled>SEND_EMAIL (coming soon)</option>
            </select>
            <div className="mt-3 space-y-2">
              {(form.action === "SEND_NOTIFICATION" || form.action === "SEND_EMAIL") && (
                <>
                  <select className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" onChange={(e) => setForm((prev) => ({ ...prev, actionConfig: { ...prev.actionConfig, targetRole: e.target.value } }))}>
                    {Object.values(USER_ROLES).map((role) => <option key={role} value={role}>{role}</option>)}
                    <option value="ASSIGNED_REP">ASSIGNED_REP</option>
                  </select>
                  <input placeholder="Title / subject template" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" onChange={(e) => setForm((prev) => ({ ...prev, actionConfig: { ...prev.actionConfig, titleTemplate: e.target.value, subjectTemplate: e.target.value } }))} />
                  <textarea placeholder="Message / body template" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" rows={2} onChange={(e) => setForm((prev) => ({ ...prev, actionConfig: { ...prev.actionConfig, messageTemplate: e.target.value, bodyTemplate: e.target.value } }))} />
                </>
              )}
              {form.action === "CREATE_TASK" && (
                <div className="grid gap-2 md:grid-cols-2">
                  <input type="number" placeholder="Days from now" className="rounded-md border border-gray-300 px-3 py-2 text-sm" onChange={(e) => setForm((prev) => ({ ...prev, actionConfig: { ...prev.actionConfig, daysFromNow: Number(e.target.value) } }))} />
                  <input placeholder="Subject" className="rounded-md border border-gray-300 px-3 py-2 text-sm" onChange={(e) => setForm((prev) => ({ ...prev, actionConfig: { ...prev.actionConfig, subject: e.target.value } }))} />
                </div>
              )}
              {form.action === "CHANGE_STATUS" && (
                <select className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" onChange={(e) => setForm((prev) => ({ ...prev, actionConfig: { ...prev.actionConfig, newStatus: e.target.value } }))}>
                  {LEAD_STATUSES.map((status) => <option key={status}>{status}</option>)}
                </select>
              )}
              {form.action === "ASSIGN_LEAD" && (
                <select className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" onChange={(e) => setForm((prev) => ({ ...prev, actionConfig: { ...prev.actionConfig, targetUserId: e.target.value } }))}>
                  {users.map((user) => <option key={user.id} value={user.id}>{user.displayName}</option>)}
                </select>
              )}
            </div>
            <details className="mt-3">
              <summary className="cursor-pointer text-xs text-slate-500">Template variables</summary>
              <p className="mt-1 font-mono text-xs text-slate-500">{`{{leadName}} {{company}} {{assignedRep}} {{daysSinceActivity}} {{branch}}`}</p>
            </details>
          </fieldset>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="rounded-md border border-slate-300 px-4 py-2 text-sm">
              Cancel
            </button>
            <button type="submit" className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white">
              Save
            </button>
          </div>
        </form>
      )}

      <div data-demo="automations-list" className="grid gap-3 md:grid-cols-2">
        {loading
          ? Array.from({ length: 4 }).map((_, idx) => <div key={idx} className="h-28 animate-pulse rounded-xl border border-slate-200 bg-white" />)
          : automations.map((automation) => (
              <button key={automation.id} onClick={() => loadLogs(automation.id).catch(() => undefined)} className="rounded-xl border border-slate-200 bg-white p-4 text-left hover:border-blue-300">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-slate-900">{automation.name}</h3>
                  <label className="inline-flex items-center gap-2 text-xs text-slate-600">
                    Active
                    <input data-demo="automations-toggle" type="checkbox" checked={automation.isActive} onChange={(e) => { e.stopPropagation(); toggleActive(automation).catch(() => undefined); }} />
                  </label>
                </div>
                <p className="mt-1 text-sm text-slate-600">{automation.description ?? "No description"}</p>
                <p className="mt-2 text-xs text-slate-500">
                  {automation.trigger} → {automation.action} • {automation._count?.logs ?? 0} logs
                </p>
              </button>
            ))}
      </div>

      {selectedAutomation && (
        <div data-demo="automations-logs" className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="text-lg font-semibold text-slate-900">Execution Logs: {selectedAutomation.name}</h3>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2">Message</th>
                  <th className="px-2 py-2">Executed</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b border-slate-100">
                    <td className="px-2 py-2">{log.status}</td>
                    <td className="px-2 py-2">{log.message ?? "—"}</td>
                    <td className="px-2 py-2">{new Date(log.executedAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
