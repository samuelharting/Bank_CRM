import { Component, useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { AlertTriangle, DollarSign, Inbox, Trophy, TrendingUp, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { apiFetch } from "../lib/api";
import { USER_ROLES, type ApiActivity, type ApiLead, type UserRole } from "../types";

type DateScope = "week" | "month" | "quarter";

interface MetricCompare {
  current: number;
  previousMonth: number;
}

interface StatsResponse {
  viewerRole: UserRole;
  activeLeads: MetricCompare;
  pipelineValue: MetricCompare;
  leadsWon: MetricCompare;
  conversionRate: MetricCompare;
}

interface PipelineResponse {
  stages: Array<{ status: "PROSPECT" | "CONTACTED" | "QUALIFIED" | "PROPOSAL" | "WON"; count: number; totalValue: number }>;
}

interface LeaderboardResponse {
  reps: Array<{
    userId: string;
    displayName: string;
    branch: string;
    totalActivities: number;
    callsMade: number;
    leadsTouched: number;
    pipelineGenerated: number;
    followUpCompliance: number;
  }>;
}

interface FeedResponse {
  activities: Array<ApiActivity & { user: { displayName: string }; lead: ApiLead }>;
}

interface StaleLeadsResponse {
  leads: Array<{ id: string; name: string; company: string | null; daysSinceLastTouch: number; assignedRep: string }>;
}

interface FollowUpsResponse {
  leads: Array<ApiLead & { followUpState: "OVERDUE" | "TODAY" | "UPCOMING" }>;
}

const cache = new Map<string, { timestamp: number; data: unknown }>();
const cacheTtlMs = 60000;

async function cachedApiFetch<T>(key: string, path: string): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.timestamp < cacheTtlMs) return hit.data as T;
  const data = await apiFetch<T>(path);
  cache.set(key, { timestamp: Date.now(), data });
  return data;
}

class SectionErrorBoundary extends Component<{ children: ReactNode; title: string }, { hasError: boolean }> {
  constructor(props: { children: ReactNode; title: string }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
          Unable to load {this.props.title}. Please refresh and try again.
        </div>
      );
    }
    return this.props.children;
  }
}

const statusColors: Record<PipelineResponse["stages"][number]["status"], string> = {
  PROSPECT: "#9ca3af",
  CONTACTED: "#2563eb",
  QUALIFIED: "#d97706",
  PROPOSAL: "#7c3aed",
  WON: "#16a34a",
};

const statusLabels: Record<string, string> = {
  PROSPECT: "Prospect",
  CONTACTED: "Contacted",
  QUALIFIED: "Qualified",
  PROPOSAL: "Proposal",
  WON: "Won",
};

const scopeLabels: Record<DateScope, string> = {
  week: "vs last week",
  month: "vs last month",
  quarter: "vs last quarter",
};

function EmptyState({ icon: Icon, message }: { icon: typeof Inbox; message: string }): JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-slate-400">
      <Icon className="h-8 w-8 mb-2" />
      <p className="text-sm">{message}</p>
    </div>
  );
}

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const relativeTime = (dateIso: string): string => {
  const diffMs = Date.now() - new Date(dateIso).getTime();
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  return `${days} days ago`;
};

export function Dashboard(): JSX.Element {
  const navigate = useNavigate();
  const [scope, setScope] = useState<DateScope>("month");
  const [role, setRole] = useState<UserRole>(USER_ROLES.SALES_REP);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [pipeline, setPipeline] = useState<PipelineResponse | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardResponse | null>(null);
  const [feed, setFeed] = useState<FeedResponse | null>(null);
  const [stale, setStale] = useState<StaleLeadsResponse | null>(null);
  const [followUps, setFollowUps] = useState<FollowUpsResponse | null>(null);
  const [loading, setLoading] = useState({
    stats: true,
    pipeline: true,
    leaderboard: true,
    feed: true,
    stale: true,
    followUps: true,
  });

  const load = useCallback(async () => {
    setLoading({ stats: true, pipeline: true, leaderboard: true, feed: true, stale: true, followUps: true });

    let viewerRole: UserRole = USER_ROLES.SALES_REP;
    try {
      const statsData = await cachedApiFetch<StatsResponse>(`dashboard-stats-${scope}`, `/dashboard/stats?period=${scope}`);
      setStats(statsData);
      viewerRole = statsData.viewerRole;
      setRole(statsData.viewerRole);
    } finally {
      setLoading((prev) => ({ ...prev, stats: false }));
    }

    void Promise.all([
      cachedApiFetch<PipelineResponse>(`dashboard-pipeline-${scope}`, `/dashboard/pipeline?period=${scope}`)
        .then(setPipeline)
        .finally(() => setLoading((prev) => ({ ...prev, pipeline: false }))),
      cachedApiFetch<FeedResponse>(`dashboard-feed-${scope}`, `/dashboard/feed?limit=20&period=${scope}`)
        .then(setFeed)
        .finally(() => setLoading((prev) => ({ ...prev, feed: false }))),
      cachedApiFetch<StaleLeadsResponse>(`dashboard-stale-${scope}`, `/dashboard/stale-leads?days=14&period=${scope}`)
        .then(setStale)
        .finally(() => setLoading((prev) => ({ ...prev, stale: false }))),
    ]);

    if (viewerRole === USER_ROLES.SALES_REP) {
      cachedApiFetch<FollowUpsResponse>(`dashboard-followups-${scope}`, `/dashboard/follow-ups?period=${scope}`)
        .then(setFollowUps)
        .finally(() => setLoading((prev) => ({ ...prev, followUps: false, leaderboard: false })));
    } else {
      cachedApiFetch<LeaderboardResponse>(`dashboard-leaderboard-${scope}`, `/dashboard/leaderboard?period=${scope}`)
        .then(setLeaderboard)
        .finally(() => setLoading((prev) => ({ ...prev, leaderboard: false, followUps: false })));
    }
  }, [scope]);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  const cards = useMemo(
    () =>
      stats
        ? [
            { title: "Total Active Leads", data: stats.activeLeads, icon: Users, suffix: "" },
            { title: "Pipeline Value", data: stats.pipelineValue, icon: DollarSign, suffix: "$" },
            { title: "Leads Won This Month", data: stats.leadsWon, icon: Trophy, suffix: "" },
            { title: "Conversion Rate", data: stats.conversionRate, icon: TrendingUp, suffix: "%" },
          ]
        : [],
    [stats],
  );

  const openLeadWorkspace = useCallback(
    (leadId: string) => {
      (window as unknown as Record<string, string>).__demoLeadId = leadId;
      navigate(`/leads?leadId=${leadId}`);
    },
    [navigate],
  );

  useEffect(() => {
    const openFirstFollowUp = () => {
      const leadId = followUps?.leads[0]?.id ?? feed?.activities[0]?.lead.id;
      if (leadId) {
        openLeadWorkspace(leadId);
      }
    };
    window.addEventListener("crm-demo-open-dashboard-followup", openFirstFollowUp);
    return () => window.removeEventListener("crm-demo-open-dashboard-followup", openFirstFollowUp);
  }, [feed, followUps, openLeadWorkspace]);

  return (
    <section className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold text-slate-900">Dashboard</h2>
        <select
          data-demo="dashboard-scope"
          value={scope}
          onChange={(e) => setScope(e.target.value as DateScope)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="week">This Week</option>
          <option value="month">This Month</option>
          <option value="quarter">This Quarter</option>
        </select>
      </div>

      <SectionErrorBoundary title="KPI cards">
        <div data-tour="dashboard-stats" className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {loading.stats || !stats
            ? Array.from({ length: 4 }).map((_, idx) => <div key={idx} className="h-32 animate-pulse rounded-xl border border-slate-200 bg-white" />)
            : cards.map((card) => {
                const Icon = card.icon;
                const trend = card.data.current - card.data.previousMonth;
                const trendPositive = trend >= 0;
                return (
                  <div key={card.title} {...(card.title === "Total Active Leads" ? { "data-demo": "dashboard-kpi-active" } : {})} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex items-start justify-between">
                      <p className="text-sm font-medium text-slate-500">{card.title}</p>
                      <div className="rounded-lg bg-slate-100 p-2">
                        <Icon className="h-4 w-4 text-slate-500" />
                      </div>
                    </div>
                    <p className="mt-3 text-3xl font-bold text-slate-900">
                      {card.title === "Pipeline Value"
                        ? money.format(card.data.current)
                        : card.title === "Conversion Rate"
                          ? `${card.data.current.toFixed(1)}%`
                          : `${card.data.current}`}
                    </p>
                    <p className={`mt-2 text-sm ${trendPositive ? "text-green-600" : "text-red-600"}`}>
                      {trendPositive ? "↑" : "↓"} {Math.abs(trend).toFixed(1)}
                      {card.suffix} {scopeLabels[scope]}
                    </p>
                  </div>
                );
              })}
        </div>
      </SectionErrorBoundary>

      <SectionErrorBoundary title="pipeline chart">
        <div data-tour="dashboard-pipeline" className="min-w-0 rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="text-base font-semibold text-slate-900">Pipeline Funnel</h3>
          {loading.pipeline || !pipeline ? (
            <div className="mt-3 h-80 animate-pulse rounded-lg bg-slate-100" />
          ) : (
            <div className="mt-3 h-80 w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={pipeline.stages.map((s) => ({ ...s, label: statusLabels[s.status] ?? s.status }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#64748b" }} />
                  <YAxis tick={{ fontSize: 12, fill: "#64748b" }} />
                  <Tooltip
                    contentStyle={{ borderRadius: "8px", border: "1px solid #e2e8f0", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
                    formatter={(value) => [value, "Leads"]}
                    labelFormatter={(label) => `Stage: ${label}`}
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {pipeline.stages.map((stage) => (
                      <Cell key={stage.status} fill={statusColors[stage.status]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          {!loading.pipeline && pipeline && (
            <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-600">
              {pipeline.stages.map((stage) => (
                <span key={stage.status} className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: statusColors[stage.status] }} />
                  {statusLabels[stage.status] ?? stage.status}: {stage.count}
                </span>
              ))}
            </div>
          )}
        </div>
      </SectionErrorBoundary>

      <div data-tour="dashboard-followups" className="grid min-w-0 gap-5 xl:grid-cols-2">
        <SectionErrorBoundary title={role === USER_ROLES.SALES_REP ? "follow-ups" : "leaderboard"}>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            {role === USER_ROLES.SALES_REP ? (
              <>
                <div data-demo="dashboard-work-queue" className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">Today's Work Queue</h3>
                    <p className="mt-1 text-sm text-slate-600">
                      Start here to see which customers or prospects need your next touch.
                    </p>
                  </div>
                  {!loading.followUps && followUps && followUps.leads.length > 0 && (
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                      {followUps.leads.length} live follow-up{followUps.leads.length === 1 ? "" : "s"}
                    </span>
                  )}
                </div>
                {loading.followUps || !followUps ? (
                  <div className="mt-3 h-52 animate-pulse rounded bg-slate-100" />
                ) : (
                  <div className="mt-3 space-y-2">
                    {followUps.leads.length === 0 ? (
                      <EmptyState icon={Inbox} message="No follow-ups scheduled. You're all caught up!" />
                    ) : (
                      followUps.leads.map((lead, index) => (
                        <button
                          key={lead.id}
                          {...(index === 0 ? { "data-demo": "dashboard-primary-relationship" } : {})}
                          onClick={() => openLeadWorkspace(lead.id)}
                          className="flex w-full items-center justify-between rounded-lg border border-slate-200 px-3 py-2.5 text-left transition-colors hover:bg-slate-50"
                        >
                          <div>
                            <p className="text-sm font-medium text-slate-900">
                              {lead.firstName} {lead.lastName}
                            </p>
                            <p className="text-xs text-slate-500">{lead.company ?? "No company"}</p>
                          </div>
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                              lead.followUpState === "OVERDUE"
                                ? "bg-red-100 text-red-700"
                                : lead.followUpState === "TODAY"
                                  ? "bg-amber-100 text-amber-700"
                                  : "bg-blue-100 text-blue-700"
                            }`}
                          >
                            {lead.followUpState === "OVERDUE" ? "Overdue" : lead.followUpState === "TODAY" ? "Today" : "Upcoming"}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </>
            ) : (
              <>
                <div data-demo="dashboard-leaderboard" className="mb-3 flex items-center justify-between">
                  <h3 className="text-base font-semibold text-slate-900">Rep Activity Leaderboard</h3>
                  <p className="text-xs text-slate-500">Sorted by total activities</p>
                </div>
                {loading.leaderboard || !leaderboard ? (
                  <div className="h-52 animate-pulse rounded bg-slate-100" />
                ) : leaderboard.reps.length === 0 ? (
                  <EmptyState icon={Users} message="No rep activity data for this period." />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
                        <tr>
                          <th className="px-2 py-2 text-left">#</th>
                          <th className="px-2 py-2 text-left">Rep</th>
                          <th className="px-2 py-2 text-left">Branch</th>
                          <th className="px-2 py-2 text-right">Activities</th>
                          <th className="px-2 py-2 text-right">Calls</th>
                          <th className="px-2 py-2 text-right">Pipeline</th>
                          <th className="px-2 py-2 text-right">Compliance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {leaderboard.reps
                          .slice()
                          .sort((a, b) => b.totalActivities - a.totalActivities)
                          .map((rep, index) => (
                            <tr key={rep.userId} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                              <td className="px-2 py-2 text-slate-400 font-medium">{index + 1}</td>
                              <td className="px-2 py-2 font-medium text-slate-900">
                                {index === 0 && <span className="mr-1">🏆</span>}
                                {rep.displayName}
                              </td>
                              <td className="px-2 py-2 text-slate-600">{rep.branch}</td>
                              <td className="px-2 py-2 text-right font-medium text-slate-900">{rep.totalActivities}</td>
                              <td className="px-2 py-2 text-right text-slate-600">{rep.callsMade}</td>
                              <td className="px-2 py-2 text-right text-slate-600">{money.format(rep.pipelineGenerated)}</td>
                              <td className="px-2 py-2 text-right text-slate-600">{rep.followUpCompliance.toFixed(0)}%</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        </SectionErrorBoundary>

        <SectionErrorBoundary title="recent activity feed">
          <div data-demo="dashboard-feed" className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="text-base font-semibold text-slate-900">Recent Activity</h3>
            {loading.feed || !feed ? (
              <div className="mt-3 h-52 animate-pulse rounded bg-slate-100" />
            ) : (
              <div className="mt-3 space-y-2 max-h-80 overflow-y-auto">
                {feed.activities.length === 0 ? (
                  <EmptyState icon={Inbox} message="No recent activity to show." />
                ) : (
                  feed.activities.map((activity, index) => (
                    <button
                      key={activity.id}
                      type="button"
                      {...(role !== USER_ROLES.SALES_REP && index === 0 ? { "data-demo": "dashboard-primary-relationship" } : {})}
                      onClick={() => openLeadWorkspace(activity.lead.id)}
                      className="block w-full rounded-lg border border-slate-200 px-3 py-2.5 text-left transition-colors hover:bg-slate-50"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex h-6 items-center rounded-md px-1.5 text-[10px] font-bold uppercase tracking-wide ${
                            activity.type === "CALL" ? "bg-green-100 text-green-700" :
                            activity.type === "EMAIL" ? "bg-blue-100 text-blue-700" :
                            activity.type === "MEETING" ? "bg-purple-100 text-purple-700" :
                            "bg-slate-100 text-slate-600"
                          }`}>
                            {activity.type}
                          </span>
                          <span className="text-sm font-medium text-slate-900">
                            {activity.lead.company ?? `${activity.lead.firstName} ${activity.lead.lastName}`}
                          </span>
                        </div>
                        <span className="shrink-0 text-xs text-slate-400">{relativeTime(activity.createdAt)}</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-600">{activity.subject}</p>
                      <p className="mt-0.5 text-xs text-slate-400">{activity.user?.displayName ?? "Team member"}</p>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </SectionErrorBoundary>
      </div>

      <SectionErrorBoundary title="leads going cold">
        {!loading.stale && stale && stale.leads.length > 0 && (
          <button
            data-demo="dashboard-cold-banner"
            onClick={() => navigate("/leads?moreFilters=1")}
            className="flex w-full items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-left transition-colors hover:bg-amber-100"
          >
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-amber-900">{stale.leads.length} lead{stale.leads.length !== 1 ? "s" : ""} going cold</p>
              <p className="mt-0.5 truncate text-xs text-amber-700">
                {stale.leads.slice(0, 3).map((l) => l.name).join(", ")}{stale.leads.length > 3 ? ` +${stale.leads.length - 3} more` : ""}
              </p>
            </div>
            <span className="shrink-0 text-xs font-medium text-amber-700">Review in Leads</span>
          </button>
        )}
      </SectionErrorBoundary>
    </section>
  );
}
