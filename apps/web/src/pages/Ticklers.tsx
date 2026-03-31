import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { isReadOnlyRole } from "../lib/roles";
import { useAuth } from "../auth/useAuth";
import { ToastContainer, type ToastMessage } from "../components/Toast";
import type { ApiLead, ApiTickler, TicklerRecurrence } from "../types";
import { TICKLER_RECURRENCES, TICKLER_RECURRENCE_LABELS } from "../types";

type FilterTab = "overdue" | "today" | "upcoming" | "completed";

const TAB_LABELS: Record<FilterTab, string> = {
  overdue: "Overdue",
  today: "Today",
  upcoming: "Upcoming",
  completed: "Done",
};

function getTabForDueAt(dueAt: string): FilterTab {
  const dueDate = new Date(dueAt);
  const now = new Date();
  const dueDay = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (dueDay < today) return "overdue";
  if (dueDay.getTime() === today.getTime()) return "today";
  return "upcoming";
}

interface TicklerListResponse {
  results: ApiTickler[];
  total: number;
  page: number;
  pageSize: number;
}

const emptyForm = (): {
  leadId: string;
  title: string;
  notes: string;
  dueAt: string;
  recurrence: TicklerRecurrence;
} => ({
  leadId: "",
  title: "",
  notes: "",
  dueAt: new Date(Date.now() + 86400000).toISOString().slice(0, 16),
  recurrence: "NONE",
});

export function Ticklers(): JSX.Element {
  const [searchParams] = useSearchParams();
  const { role } = useAuth();
  const readOnly = isReadOnlyRole(role);
  const [tab, setTab] = useState<FilterTab>("overdue");
  const [ticklers, setTicklers] = useState<ApiTickler[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [leads, setLeads] = useState<ApiLead[]>([]);
  const [leadSearch, setLeadSearch] = useState("");
  const [leadSearchLoading, setLeadSearchLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeLead, setActiveLead] = useState<ApiLead | null>(null);
  const leadIdFilter = searchParams.get("leadId");

  const addToast = useCallback((type: ToastMessage["type"], message: string) => {
    setToasts((prev) => [...prev, { id: Date.now() + Math.random(), type, message }]);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ filter: tab, pageSize: "100" });
      if (leadIdFilter) params.set("leadId", leadIdFilter);
      const data = await apiFetch<TicklerListResponse>(`/ticklers?${params.toString()}`);
      setTicklers(data.results);
      setTotal(data.total);
    } catch (error) {
      addToast("error", error instanceof Error ? error.message : "Unable to load ticklers");
    } finally {
      setLoading(false);
    }
  }, [addToast, leadIdFilter, tab]);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  useEffect(() => {
    if (!leadIdFilter) {
      setActiveLead(null);
      return;
    }
    apiFetch<ApiLead>(`/leads/${leadIdFilter}`)
      .then((lead) => {
        setActiveLead(lead);
        setForm((prev) => (prev.leadId === lead.id ? prev : { ...prev, leadId: lead.id }));
        setLeadSearch(`${lead.firstName} ${lead.lastName}`);
      })
      .catch(() => setActiveLead(null));
  }, [leadIdFilter]);

  useEffect(() => {
    const setDemoTab = (event: Event) => {
      const detail = (event as CustomEvent<FilterTab>).detail;
      if (detail === "overdue" || detail === "today" || detail === "upcoming" || detail === "completed") {
        setTab(detail);
      }
    };
    window.addEventListener("crm-demo-set-ticklers-tab", setDemoTab);
    return () => window.removeEventListener("crm-demo-set-ticklers-tab", setDemoTab);
  }, []);

  const searchLeads = useCallback(
    async (query: string) => {
      if (query.length < 2) {
        setLeadSearchLoading(false);
        setLeads([]);
        return;
      }
      setLeadSearchLoading(true);
      try {
        const data = await apiFetch<{ results: ApiLead[] }>(`/leads?search=${encodeURIComponent(query)}&pageSize=10`);
        setLeads(data.results);
      } catch {
        /* swallow */
      } finally {
        setLeadSearchLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    const t = window.setTimeout(() => searchLeads(leadSearch), 300);
    return () => window.clearTimeout(t);
  }, [leadSearch, searchLeads]);

  const createTickler = async (): Promise<void> => {
    if (!form.leadId || !form.title.trim() || !form.dueAt) {
      addToast("error", "Pick a lead, enter a title, and set a due date.");
      return;
    }
    setSaving(true);
    try {
      const nextTab = getTabForDueAt(form.dueAt);
      await apiFetch<ApiTickler>("/ticklers", {
        method: "POST",
        body: JSON.stringify({
          leadId: form.leadId,
          title: form.title.trim(),
          notes: form.notes.trim() || undefined,
          dueAt: new Date(form.dueAt).toISOString(),
          recurrence: form.recurrence,
        }),
      });
      setForm(emptyForm());
      setShowForm(false);
      setTab(nextTab);
      addToast("success", "Tickler created");
      if (nextTab === tab) {
        await load();
      }
    } catch (error) {
      addToast("error", error instanceof Error ? error.message : "Unable to create tickler");
    } finally {
      setSaving(false);
    }
  };

  const completeTickler = async (tickler: ApiTickler): Promise<void> => {
    try {
      const res = await apiFetch<{ ok: boolean; recurred: boolean }>(`/ticklers/${tickler.id}/complete`, { method: "POST" });
      addToast("success", res.recurred ? "Completed — next occurrence created" : "Completed");
      await load();
    } catch (error) {
      addToast("error", error instanceof Error ? error.message : "Unable to complete");
    }
  };

  const snoozeTickler = async (tickler: ApiTickler, days: number): Promise<void> => {
    const until = new Date(Date.now() + days * 86400000).toISOString();
    try {
      await apiFetch(`/ticklers/${tickler.id}/snooze`, {
        method: "POST",
        body: JSON.stringify({ until }),
      });
      addToast("success", `Snoozed ${days} day${days > 1 ? "s" : ""}`);
      await load();
    } catch (error) {
      addToast("error", error instanceof Error ? error.message : "Unable to snooze");
    }
  };

  const deleteTickler = async (tickler: ApiTickler): Promise<void> => {
    if (!window.confirm(`Delete "${tickler.title}"?`)) return;
    try {
      await apiFetch(`/ticklers/${tickler.id}`, { method: "DELETE" });
      addToast("success", "Tickler deleted");
      await load();
    } catch (error) {
      addToast("error", error instanceof Error ? error.message : "Unable to delete");
    }
  };

  const isOverdue = (t: ApiTickler): boolean => !t.completedAt && new Date(t.dueAt) < new Date();

  return (
    <section data-tour="ticklers-overview" className="space-y-4">
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Ticklers</h2>
          <p className="mt-1 text-sm text-slate-600">Set the next reminder before you leave a lead so no follow-up lives only in Outlook.</p>
        </div>
        {!readOnly && (
          <button
            data-demo="ticklers-create"
            onClick={() => setShowForm((prev) => !prev)}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            {showForm ? "Cancel" : "New Tickler"}
          </button>
        )}
      </div>

      {activeLead && (
        <div data-demo="ticklers-lead-context" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-blue-900">
              Showing ticklers for {activeLead.firstName} {activeLead.lastName}
            </p>
            <p className="text-xs text-blue-700">{activeLead.company ?? "No company on file"}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to={`/leads?leadId=${activeLead.id}`} className="rounded-md border border-blue-200 bg-white px-3 py-2 text-sm text-blue-700 hover:bg-blue-100">
              Open lead
            </Link>
            <Link to="/ticklers" className="rounded-md border border-blue-200 bg-white px-3 py-2 text-sm text-blue-700 hover:bg-blue-100">
              Clear filter
            </Link>
          </div>
        </div>
      )}

      {showForm && !readOnly && (
        <div data-demo="ticklers-form" className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="block text-sm sm:col-span-2 lg:col-span-3">
              <span className="text-slate-700">Search lead</span>
              <input
                value={leadSearch}
                onChange={(e) => setLeadSearch(e.target.value)}
                placeholder="Type a prospect name…"
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              {leadSearch.length > 0 && leadSearch.length < 2 && (
                <p className="mt-1 text-xs text-slate-500">Type at least 2 characters to search for a lead.</p>
              )}
              {leadSearchLoading && <p className="mt-1 text-xs text-slate-500">Searching leads...</p>}
              {leads.length > 0 && (
                <ul className="mt-1 max-h-40 overflow-auto rounded border border-slate-200 bg-white text-sm shadow">
                  {leads.map((lead) => (
                    <li key={lead.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setForm((prev) => ({ ...prev, leadId: lead.id }));
                          setLeadSearch(`${lead.firstName} ${lead.lastName}`);
                          setLeads([]);
                        }}
                        className={`w-full px-3 py-2 text-left hover:bg-blue-50 ${form.leadId === lead.id ? "bg-blue-50 font-medium" : ""}`}
                      >
                        {lead.firstName} {lead.lastName} {lead.company ? `— ${lead.company}` : ""}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {!leadSearchLoading && leadSearch.length >= 2 && leads.length === 0 && (
                <p className="mt-1 text-xs text-amber-700">No matching leads found for that search yet.</p>
              )}
            </label>
            <label className="block text-sm">
              <span className="text-slate-700">Title <span className="text-red-600">*</span></span>
              <input
                value={form.title}
                onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-700">Due</span>
              <input
                type="datetime-local"
                value={form.dueAt}
                onChange={(e) => setForm((prev) => ({ ...prev, dueAt: e.target.value }))}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-700">Recurrence</span>
              <select
                value={form.recurrence}
                onChange={(e) => setForm((prev) => ({ ...prev, recurrence: e.target.value as TicklerRecurrence }))}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {TICKLER_RECURRENCES.map((r) => (
                  <option key={r} value={r}>
                    {TICKLER_RECURRENCE_LABELS[r]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm sm:col-span-2 lg:col-span-3">
              <span className="text-slate-700">Notes</span>
              <textarea
                value={form.notes}
                onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                rows={2}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </label>
          </div>
          <button
            type="button"
            disabled={saving || !form.leadId || !form.title.trim() || !form.dueAt}
            onClick={() => createTickler().catch(() => undefined)}
            className="mt-3 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Create Tickler"}
          </button>
        </div>
      )}

      <div className="flex gap-2 border-b border-slate-200 pb-1">
        {(Object.entries(TAB_LABELS) as [FilterTab, string][]).map(([key, label]) => (
          <button
            key={key}
            data-demo={`ticklers-tab-${key}`}
            onClick={() => setTab(key)}
            className={`rounded-md px-3 py-1 text-sm font-medium ${tab === key ? "bg-blue-100 text-blue-700" : "text-slate-600 hover:bg-slate-50"}`}
          >
            {label}
          </button>
        ))}
        <span className="ml-auto text-xs text-slate-500 self-center">{total} result{total !== 1 ? "s" : ""}</span>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
          ))}
        </div>
      ) : ticklers.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">No ticklers in this view.</p>
      ) : (
        <div className="space-y-3">
          {ticklers.map((t, index) => (
            <div
              key={t.id}
              {...(index === 0 ? { "data-demo": "ticklers-first-item" } : {})}
              className={`rounded-xl border p-4 shadow-sm ${isOverdue(t) ? "border-red-200 bg-red-50" : t.completedAt ? "border-green-200 bg-green-50 opacity-80" : "border-slate-200 bg-white"}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className={`text-sm font-semibold ${isOverdue(t) ? "text-red-900" : "text-slate-900"}`}>{t.title}</p>
                  <p className="mt-0.5 text-xs text-slate-600">
                    Due: {new Date(t.dueAt).toLocaleString()} · {TICKLER_RECURRENCE_LABELS[t.recurrence]}
                    {t.snoozedUntil && !t.completedAt ? ` · Snoozed until ${new Date(t.snoozedUntil).toLocaleString()}` : ""}
                    {t.completedAt ? ` · Done ${new Date(t.completedAt).toLocaleString()}` : ""}
                  </p>
                  {t.notes && <p className="mt-1 text-xs text-slate-500">{t.notes}</p>}
                  {t.lead && (
                    <Link to={`/leads?leadId=${t.lead.id}`} className="mt-1 inline-block text-xs font-medium text-blue-600 hover:underline">
                      {t.lead.firstName} {t.lead.lastName}{t.lead.company ? ` — ${t.lead.company}` : ""}
                    </Link>
                  )}
                  {t.owner && <p className="text-[11px] text-slate-400">{t.owner.displayName}</p>}
                </div>
                {!readOnly && !t.completedAt && (
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => completeTickler(t).catch(() => undefined)}
                      className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700"
                    >
                      Done
                    </button>
                    <select
                      data-demo="ticklers-snooze"
                      defaultValue=""
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === "1") snoozeTickler(t, 1).catch(() => undefined);
                        else if (v === "7") snoozeTickler(t, 7).catch(() => undefined);
                        else if (v === "delete") deleteTickler(t).catch(() => undefined);
                        e.target.value = "";
                      }}
                      className="rounded-md border border-slate-300 px-2 py-1.5 text-xs text-slate-600"
                    >
                      <option value="" disabled>More…</option>
                      <option value="1">Snooze +1 day</option>
                      <option value="7">Snooze +7 days</option>
                      <option value="delete">Delete</option>
                    </select>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
