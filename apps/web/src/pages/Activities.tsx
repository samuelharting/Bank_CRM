import { ChevronDown, ChevronUp, Clock, FileText, Mail, Phone, Users, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { apiFetch } from "../lib/api";
import { isReadOnlyRole } from "../lib/roles";
import { useAuth } from "../auth/useAuth";
import { ACTIVITY_TYPES, type ActivityType, type ApiActivity, type ApiLead, type ApiUser } from "../types";

interface ActivityListResponse {
  results: Array<ApiActivity & { lead: ApiLead; user: ApiUser }>;
  total: number;
}

const iconForType = (type: ActivityType): JSX.Element => {
  if (type === "CALL") return <Phone className="h-4 w-4 text-blue-600" />;
  if (type === "EMAIL") return <Mail className="h-4 w-4 text-indigo-600" />;
  if (type === "MEETING") return <Users className="h-4 w-4 text-purple-600" />;
  if (type === "NOTE") return <FileText className="h-4 w-4 text-slate-600" />;
  return <Clock className="h-4 w-4 text-amber-600" />;
};

export function Activities(): JSX.Element {
  const { role } = useAuth();
  const readOnly = isReadOnlyRole(role);
  const [activities, setActivities] = useState<Array<ApiActivity & { lead: ApiLead; user: ApiUser }>>([]);
  const [leads, setLeads] = useState<ApiLead[]>([]);
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"timeline" | "calendar">("timeline");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [repFilter, setRepFilter] = useState("ALL");
  const [branchFilter, setBranchFilter] = useState("ALL");
  const [completionFilter, setCompletionFilter] = useState("ALL");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [calendar, setCalendar] = useState<Record<string, Record<string, number>>>({});
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [form, setForm] = useState({
    type: "CALL" as ActivityType,
    leadId: "",
    subject: "",
    description: "",
    dateTime: new Date().toISOString().slice(0, 16),
    completed: true,
  });

  const load = async (): Promise<void> => {
    setLoading(true);
    const params = new URLSearchParams({
      page: "1",
      pageSize: "200",
      type: typeFilter,
      userId: repFilter,
      branch: branchFilter,
      completion: completionFilter.toLowerCase(),
      startDate,
      endDate,
    });
    const [activityRes, leadRes, userRes, calendarRes] = await Promise.all([
      apiFetch<ActivityListResponse>(`/activities?${params.toString()}`),
      apiFetch<{ results: ApiLead[] }>("/leads?page=1&pageSize=200"),
      apiFetch<ApiUser[]>("/users"),
      apiFetch<{ days: Record<string, Record<string, number>> }>(`/activities/calendar?month=${month}`),
    ]);
    setActivities(activityRes.results);
    setLeads(leadRes.results);
    setUsers(userRes);
    setCalendar(calendarRes.days);
    setLoading(false);
  };

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      load().catch(() => setLoading(false));
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [branchFilter, completionFilter, endDate, month, repFilter, startDate, typeFilter]);

  useEffect(() => {
    const openLog = (): void => {
      if (!readOnly) setPanelOpen(true);
    };
    const close = (): void => {
      setPanelOpen(false);
    };
    window.addEventListener("crm-open-log-activity", openLog);
    window.addEventListener("crm-close-overlays", close);
    return () => {
      window.removeEventListener("crm-open-log-activity", openLog);
      window.removeEventListener("crm-close-overlays", close);
    };
  }, [readOnly]);

  const grouped = useMemo(() => {
    const byDate = new Map<string, Array<ApiActivity & { lead: ApiLead; user: ApiUser }>>();
    for (const activity of activities) {
      const d = new Date(activity.completedAt ?? activity.scheduledAt ?? activity.createdAt);
      const key = d.toISOString().slice(0, 10);
      if (!byDate.has(key)) byDate.set(key, []);
      byDate.get(key)?.push(activity);
    }
    return Array.from(byDate.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [activities]);

  const dayActivities = useMemo(
    () =>
      selectedDay
        ? activities.filter((activity) => (activity.scheduledAt ?? activity.completedAt ?? activity.createdAt).slice(0, 10) === selectedDay)
        : [],
    [activities, selectedDay],
  );

  const save = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (readOnly) return;
    await apiFetch("/activities", {
      method: "POST",
      body: JSON.stringify({
        type: form.type,
        leadId: form.leadId,
        subject: form.subject,
        description: form.description || undefined,
        ...(form.completed ? { completedAt: form.dateTime } : { scheduledAt: form.dateTime }),
      }),
    });
    setPanelOpen(false);
    await load();
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold text-slate-900">Activities</h2>
        {!readOnly && (
          <button onClick={() => setPanelOpen(true)} className="min-h-11 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white">
            Log Activity
          </button>
        )}
      </div>

      {(() => {
        const advFilterCount = [repFilter !== "ALL", branchFilter !== "ALL", completionFilter !== "ALL"].filter(Boolean).length;
        return (
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center gap-2">
              <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="rounded-md border border-gray-300 px-3 py-2 text-sm">
                <option value="ALL">All types</option>
                {ACTIVITY_TYPES.map((type) => (
                  <option key={type}>{type}</option>
                ))}
              </select>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="rounded-md border border-gray-300 px-3 py-2 text-sm" placeholder="From" />
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="rounded-md border border-gray-300 px-3 py-2 text-sm" placeholder="To" />
              <button
                onClick={() => setShowMoreFilters((prev) => !prev)}
                className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                  advFilterCount > 0 ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-300 text-slate-600 hover:bg-slate-50"
                }`}
              >
                More{advFilterCount > 0 && <span className="rounded-full bg-blue-600 px-1.5 text-[10px] text-white">{advFilterCount}</span>}
                {showMoreFilters ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>
              <div className="ml-auto inline-flex rounded-md bg-slate-100 p-0.5 text-sm">
                <button onClick={() => setViewMode("timeline")} className={`rounded px-3 py-1.5 ${viewMode === "timeline" ? "bg-white shadow-sm font-medium" : "text-slate-600"}`}>
                  Timeline
                </button>
                <button onClick={() => setViewMode("calendar")} className={`rounded px-3 py-1.5 ${viewMode === "calendar" ? "bg-white shadow-sm font-medium" : "text-slate-600"}`}>
                  Calendar
                </button>
              </div>
            </div>
            {showMoreFilters && (
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                <select value={repFilter} onChange={(e) => setRepFilter(e.target.value)} className="rounded-md border border-gray-300 px-3 py-2 text-sm">
                  <option value="ALL">All reps</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>{user.displayName}</option>
                  ))}
                </select>
                <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)} className="rounded-md border border-gray-300 px-3 py-2 text-sm">
                  <option value="ALL">All branches</option>
                  {Array.from(new Set(users.map((u) => u.branch).filter(Boolean))).map((branch) => (
                    <option key={branch ?? "branch"}>{branch}</option>
                  ))}
                </select>
                <select value={completionFilter} onChange={(e) => setCompletionFilter(e.target.value)} className="rounded-md border border-gray-300 px-3 py-2 text-sm">
                  <option value="ALL">All status</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="SCHEDULED">Scheduled</option>
                </select>
                {advFilterCount > 0 && (
                  <button
                    onClick={() => { setRepFilter("ALL"); setBranchFilter("ALL"); setCompletionFilter("ALL"); }}
                    className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
                  >
                    <X className="h-3.5 w-3.5" /> Clear
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {loading ? (
        <div className="h-64 animate-pulse rounded-xl border border-slate-200 bg-white" />
      ) : viewMode === "timeline" ? (
        <div className="space-y-4">
          {grouped.map(([date, entries]) => (
            <div key={date} className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-sm font-semibold text-slate-900">{new Date(date).toLocaleDateString()}</p>
              <div className="mt-3 space-y-2">
                {entries.map((activity) => (
                  <div key={activity.id} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex items-center justify-between">
                      <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                        {iconForType(activity.type)} {activity.subject}
                      </p>
                      <span className={`rounded-full px-2 py-1 text-xs ${activity.completedAt ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                        {activity.completedAt ? "Completed" : "Scheduled"}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-slate-600">{activity.description ?? "No description provided."}</p>
                    <p className="mt-2 text-xs text-slate-500">
                      {activity.lead.firstName} {activity.lead.lastName} ({activity.lead.company ?? "No company"}) - {activity.user.displayName}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {activities.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600">
              No activities yet - log your first customer touchpoint to begin the timeline.
            </div>
          )}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-900">Month View</p>
              <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="rounded-md border border-gray-300 px-2 py-1 text-sm" />
            </div>
            <div className="grid grid-cols-7 gap-1 text-xs text-slate-600">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <p key={d} className="py-1 text-center font-medium text-slate-500">{d}</p>
              ))}
              {(() => {
                const first = new Date(`${month}-01T00:00:00`);
                const startDow = first.getDay();
                const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
                const totalCells = startDow + daysInMonth;
                const rows = Math.ceil(totalCells / 7) * 7;
                return Array.from({ length: rows }).map((_, idx) => {
                  const dayNum = idx - startDow + 1;
                  const inMonth = dayNum >= 1 && dayNum <= daysInMonth;
                  const cellDate = new Date(first.getFullYear(), first.getMonth(), dayNum);
                  const key = inMonth ? cellDate.toISOString().slice(0, 10) : `blank-${idx}`;
                  const dayData = inMonth ? (calendar[key] ?? {}) : {};
                  const scheduledCount = Object.values(dayData).reduce((sum, value) => sum + value, 0);
                  return (
                    <button
                      key={key}
                      disabled={!inMonth}
                      onClick={() => inMonth && setSelectedDay(key)}
                      className={`min-h-20 rounded border p-1 text-left ${!inMonth ? "border-transparent" : selectedDay === key ? "border-blue-500 bg-blue-50" : "border-slate-200 bg-white"}`}
                    >
                      {inMonth && (
                        <>
                          <p>{dayNum}</p>
                          {scheduledCount > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {Object.entries(dayData).map(([type, count]) => (
                                <span key={type} className={`inline-flex h-2 w-2 rounded-full ${type === "FOLLOW_UP" ? "bg-red-500" : type === "CALL" ? "bg-blue-500" : type === "EMAIL" ? "bg-indigo-500" : "bg-slate-500"}`} title={`${type}: ${count}`} />
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </button>
                  );
                });
              })()}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-sm font-semibold text-slate-900">{selectedDay ? `Activities on ${selectedDay}` : "Select a day"}</p>
            <div className="mt-3 space-y-2">
              {dayActivities.map((activity) => (
                <div key={activity.id} className="rounded border border-slate-200 px-3 py-2 text-sm">
                  <p className="font-medium text-slate-900">{activity.subject}</p>
                  <p className="text-xs text-slate-600">{activity.lead.company ?? `${activity.lead.firstName} ${activity.lead.lastName}`}</p>
                  {!activity.completedAt && activity.scheduledAt && new Date(activity.scheduledAt) < new Date() && (
                    <p className="text-xs text-red-600">Overdue follow-up</p>
                  )}
                </div>
              ))}
              {selectedDay && dayActivities.length === 0 && <p className="text-sm text-slate-500">No activities for this day.</p>}
            </div>
          </div>
        </div>
      )}

      {panelOpen && !readOnly && (
        <div className="fixed inset-0 z-[80]">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setPanelOpen(false)} />
          <aside className="absolute right-0 top-0 h-full w-full max-w-xl bg-white shadow-xl">
            <form onSubmit={save} className="flex h-full flex-col">
              <div className="border-b border-slate-200 px-6 py-4">
                <h3 className="text-lg font-semibold text-slate-900">Quick Log Activity</h3>
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto px-6 py-4">
                <select value={form.type} onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value as ActivityType }))} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm">
                  {ACTIVITY_TYPES.map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
                <select value={form.leadId} onChange={(e) => setForm((prev) => ({ ...prev, leadId: e.target.value }))} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm">
                  <option value="">Select lead</option>
                  {leads.map((lead) => (
                    <option key={lead.id} value={lead.id}>
                      {lead.firstName} {lead.lastName} - {lead.company ?? "No company"}
                    </option>
                  ))}
                </select>
                <input value={form.subject} onChange={(e) => setForm((prev) => ({ ...prev, subject: e.target.value }))} placeholder="Subject" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
                <textarea value={form.description} onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))} rows={4} placeholder="Description" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
                <input type="datetime-local" value={form.dateTime} onChange={(e) => setForm((prev) => ({ ...prev, dateTime: e.target.value }))} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
                <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={form.completed} onChange={(e) => setForm((prev) => ({ ...prev, completed: e.target.checked }))} />
                  Completed
                </label>
              </div>
              <div className="flex justify-end gap-2 border-t border-slate-200 px-6 py-4">
                <button type="button" onClick={() => setPanelOpen(false)} className="min-h-11 rounded-md border border-slate-300 px-4 py-2 text-sm">
                  Cancel
                </button>
                <button type="submit" className="min-h-11 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white">
                  Save Activity
                </button>
              </div>
            </form>
          </aside>
        </div>
      )}
    </section>
  );
}
