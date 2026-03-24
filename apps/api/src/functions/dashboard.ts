import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { ActivityType, LeadStatus, Prisma, UserRole } from "@prisma/client";
import { prisma } from "../db/client.js";
import { corsHeaders, handleCorsPreflight, requireAuth } from "../middleware/auth.js";
import { activityScopeWhere, leadScopeWhere } from "../middleware/scope.js";

const activeStatusFilter: LeadStatus[] = [LeadStatus.PROSPECT, LeadStatus.CONTACTED, LeadStatus.QUALIFIED, LeadStatus.PROPOSAL];
const wonLostStatusFilter: LeadStatus[] = [LeadStatus.WON, LeadStatus.LOST];

const monthStart = (date: Date): Date => new Date(date.getFullYear(), date.getMonth(), 1);
const addMonths = (date: Date, amount: number): Date => new Date(date.getFullYear(), date.getMonth() + amount, 1);
const subtractDays = (date: Date, days: number): Date => new Date(date.getTime() - days * 24 * 60 * 60 * 1000);

const num = (value: Prisma.Decimal | number | null | undefined): number => (value ? Number(value) : 0);

const withError = (context: InvocationContext, label: string, error: unknown): HttpResponseInit => {
  context.error(label, error);
  const message = error instanceof Error ? error.message : "Unexpected server error";
  return { status: 500, headers: corsHeaders(), jsonBody: { error: "Request failed", details: message } };
};

const ensureManagerOrExec = (role: UserRole): boolean =>
  role === UserRole.BRANCH_MANAGER || role === UserRole.EXECUTIVE || role === UserRole.ADMIN || role === UserRole.COMPLIANCE_READONLY;

export async function dashboardStats(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const preflight = handleCorsPreflight(request);
  if (preflight) return preflight;
  const auth = await requireAuth(request, context);
  if ("response" in auth) return auth.response;

  try {
    const now = new Date();
    const currentMonthStart = monthStart(now);
    const previousMonthStart = addMonths(currentMonthStart, -1);
    const previousMonthEnd = currentMonthStart;
    const last90Start = subtractDays(now, 90);
    const previous90Start = subtractDays(last90Start, 90);
    const scope = leadScopeWhere(auth.user);

    const [activeCurrent, activePrevious, pipelineCurrent, pipelinePrevious, wonCurrent, wonPrevious, conversionCurrent, conversionPrevious] =
      await Promise.all([
        prisma.lead.count({ where: { AND: [scope, { status: { in: activeStatusFilter } }] } }),
        prisma.lead.count({
          where: {
            AND: [scope, { status: { in: activeStatusFilter }, createdAt: { gte: previousMonthStart, lt: previousMonthEnd } }],
          },
        }),
        prisma.lead.aggregate({ _sum: { pipelineValue: true }, where: { AND: [scope, { status: { in: activeStatusFilter } }] } }),
        prisma.lead.aggregate({
          _sum: { pipelineValue: true },
          where: {
            AND: [scope, { status: { in: activeStatusFilter }, createdAt: { gte: previousMonthStart, lt: previousMonthEnd } }],
          },
        }),
        prisma.lead.count({
          where: {
            AND: [scope, { status: LeadStatus.WON, updatedAt: { gte: currentMonthStart } }],
          },
        }),
        prisma.lead.count({
          where: {
            AND: [scope, { status: LeadStatus.WON, updatedAt: { gte: previousMonthStart, lt: previousMonthEnd } }],
          },
        }),
        prisma.lead.groupBy({
          by: ["status"],
          where: {
            AND: [scope, { status: { in: wonLostStatusFilter }, updatedAt: { gte: last90Start } }],
          },
          _count: { status: true },
        }),
        prisma.lead.groupBy({
          by: ["status"],
          where: {
            AND: [scope, { status: { in: wonLostStatusFilter }, updatedAt: { gte: previous90Start, lt: last90Start } }],
          },
          _count: { status: true },
        }),
      ]);

    const convertRate = (rows: Array<{ status: LeadStatus; _count: { status: number } }>): number => {
      const won = rows.find((row) => row.status === LeadStatus.WON)?._count.status ?? 0;
      const lost = rows.find((row) => row.status === LeadStatus.LOST)?._count.status ?? 0;
      const total = won + lost;
      return total === 0 ? 0 : Number(((won / total) * 100).toFixed(1));
    };

    return {
      status: 200,
      headers: corsHeaders(),
      jsonBody: {
        viewerRole: auth.user.role,
        activeLeads: { current: activeCurrent, previousMonth: activePrevious },
        pipelineValue: { current: num(pipelineCurrent._sum.pipelineValue), previousMonth: num(pipelinePrevious._sum.pipelineValue) },
        leadsWon: { current: wonCurrent, previousMonth: wonPrevious },
        conversionRate: { current: convertRate(conversionCurrent), previousMonth: convertRate(conversionPrevious) },
      },
    };
  } catch (error) {
    return withError(context, "dashboardStats failed", error);
  }
}

export async function dashboardPipeline(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const preflight = handleCorsPreflight(request);
  if (preflight) return preflight;
  const auth = await requireAuth(request, context);
  if ("response" in auth) return auth.response;

  try {
    const scope = leadScopeWhere(auth.user);
    const statuses: LeadStatus[] = [LeadStatus.PROSPECT, LeadStatus.CONTACTED, LeadStatus.QUALIFIED, LeadStatus.PROPOSAL, LeadStatus.WON];
    const stages = await Promise.all(
      statuses.map(async (status) => {
        const [count, value] = await Promise.all([
          prisma.lead.count({ where: { AND: [scope, { status }] } }),
          prisma.lead.aggregate({ _sum: { pipelineValue: true }, where: { AND: [scope, { status }] } }),
        ]);
        return { status, count, totalValue: num(value._sum.pipelineValue) };
      }),
    );

    return { status: 200, headers: corsHeaders(), jsonBody: { stages } };
  } catch (error) {
    return withError(context, "dashboardPipeline failed", error);
  }
}

export async function dashboardLeaderboard(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const preflight = handleCorsPreflight(request);
  if (preflight) return preflight;
  const auth = await requireAuth(request, context);
  if ("response" in auth) return auth.response;

  try {
    if (!ensureManagerOrExec(auth.user.role)) {
      return { status: 403, headers: corsHeaders(), jsonBody: { error: "Not authorized for leaderboard view" } };
    }
    const period = request.query.get("period") ?? "month";
    const now = new Date();
    const start =
      period === "week"
        ? subtractDays(now, 7)
        : period === "quarter"
          ? subtractDays(now, 90)
          : monthStart(now);

    const userWhere: Prisma.UserWhereInput =
      auth.user.role === UserRole.BRANCH_MANAGER ? { isActive: true, branch: auth.user.branch ?? "__none__" } : { isActive: true };

    const reps = await prisma.user.findMany({
      where: userWhere,
      select: { id: true, displayName: true, branch: true },
      orderBy: { displayName: "asc" },
    });

    const repMetrics = await Promise.all(
      reps.map(async (rep) => {
        const [totalActivities, callsMade, touched, generated, assignedLeads] = await Promise.all([
          prisma.activity.count({
            where: { userId: rep.id, type: { in: [ActivityType.CALL, ActivityType.EMAIL, ActivityType.MEETING] }, createdAt: { gte: start } },
          }),
          prisma.activity.count({ where: { userId: rep.id, type: ActivityType.CALL, createdAt: { gte: start } } }),
          prisma.activity.findMany({
            where: { userId: rep.id, createdAt: { gte: start } },
            select: { leadId: true },
            distinct: ["leadId"],
          }),
          prisma.lead.aggregate({
            _sum: { pipelineValue: true },
            where: { assignedToId: rep.id, createdAt: { gte: start } },
          }),
          prisma.lead.findMany({
            where: { assignedToId: rep.id, status: { in: activeStatusFilter } },
            select: { nextFollowUp: true },
          }),
        ]);

        const nowDate = new Date();
        const compliant = assignedLeads.filter((lead) => lead.nextFollowUp && new Date(lead.nextFollowUp) >= nowDate).length;
        const followUpCompliance = assignedLeads.length ? Number(((compliant / assignedLeads.length) * 100).toFixed(1)) : 0;

        return {
          userId: rep.id,
          displayName: rep.displayName,
          branch: rep.branch ?? "Unassigned",
          totalActivities,
          callsMade,
          leadsTouched: touched.length,
          pipelineGenerated: num(generated._sum.pipelineValue),
          followUpCompliance,
        };
      }),
    );

    return { status: 200, headers: corsHeaders(), jsonBody: { reps: repMetrics } };
  } catch (error) {
    return withError(context, "dashboardLeaderboard failed", error);
  }
}

export async function dashboardFeed(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const preflight = handleCorsPreflight(request);
  if (preflight) return preflight;
  const auth = await requireAuth(request, context);
  if ("response" in auth) return auth.response;

  try {
    const limit = Number(request.query.get("limit") ?? "20");
    const activities = await prisma.activity.findMany({
      where: activityScopeWhere(auth.user),
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { user: true, lead: true },
    });
    return { status: 200, headers: corsHeaders(), jsonBody: { activities } };
  } catch (error) {
    return withError(context, "dashboardFeed failed", error);
  }
}

export async function dashboardStaleLeads(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const preflight = handleCorsPreflight(request);
  if (preflight) return preflight;
  const auth = await requireAuth(request, context);
  if ("response" in auth) return auth.response;

  try {
    const days = Number(request.query.get("days") ?? "14");
    const cutoff = subtractDays(new Date(), days);
    const leads = await prisma.lead.findMany({
      where: {
        AND: [
          leadScopeWhere(auth.user),
          { status: { in: [LeadStatus.CONTACTED, LeadStatus.QUALIFIED] } },
          { OR: [{ activities: { none: {} } }, { activities: { none: { createdAt: { gte: cutoff } } } }] },
        ],
      },
      include: { assignedTo: true, activities: { orderBy: { createdAt: "desc" }, take: 1 } },
      take: 50,
    });

    const results = leads
      .map((lead) => {
        const lastActivity = lead.activities[0]?.createdAt ?? lead.updatedAt;
        const daysSinceLastTouch = Math.floor((Date.now() - new Date(lastActivity).getTime()) / (24 * 60 * 60 * 1000));
        return {
          id: lead.id,
          name: `${lead.firstName} ${lead.lastName}`,
          company: lead.company,
          daysSinceLastTouch,
          assignedRep: lead.assignedTo.displayName,
        };
      })
      .sort((a, b) => b.daysSinceLastTouch - a.daysSinceLastTouch);

    return { status: 200, headers: corsHeaders(), jsonBody: { leads: results } };
  } catch (error) {
    return withError(context, "dashboardStaleLeads failed", error);
  }
}

export async function dashboardFollowUps(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const preflight = handleCorsPreflight(request);
  if (preflight) return preflight;
  const auth = await requireAuth(request, context);
  if ("response" in auth) return auth.response;

  try {
    const now = new Date();
    const in30Days = subtractDays(now, -30);
    const leadScope =
      auth.user.role === UserRole.SALES_REP
        ? { assignedToId: auth.user.id }
        : auth.user.role === UserRole.BRANCH_MANAGER
          ? { branch: auth.user.branch ?? "__none__" }
          : {};
    const leads = await prisma.lead.findMany({
      where: {
        ...leadScope,
        nextFollowUp: { not: null, lte: in30Days },
        status: { in: activeStatusFilter },
      },
      include: { assignedTo: true },
      orderBy: { nextFollowUp: "asc" },
      take: 100,
    });
    return {
      status: 200,
      headers: corsHeaders(),
      jsonBody: {
        leads: leads.map((lead) => ({
          ...lead,
          repName: lead.assignedTo.displayName,
          followUpState:
            lead.nextFollowUp && new Date(lead.nextFollowUp).toDateString() === now.toDateString()
              ? "TODAY"
              : lead.nextFollowUp && new Date(lead.nextFollowUp) < now
                ? "OVERDUE"
                : "UPCOMING",
        })),
      },
    };
  } catch (error) {
    return withError(context, "dashboardFollowUps failed", error);
  }
}

app.http("dashboardStats", { methods: ["GET", "OPTIONS"], authLevel: "anonymous", route: "dashboard/stats", handler: dashboardStats });
app.http("dashboardPipeline", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "dashboard/pipeline",
  handler: dashboardPipeline,
});
app.http("dashboardLeaderboard", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "dashboard/leaderboard",
  handler: dashboardLeaderboard,
});
app.http("dashboardFeed", { methods: ["GET", "OPTIONS"], authLevel: "anonymous", route: "dashboard/feed", handler: dashboardFeed });
app.http("dashboardStaleLeads", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "dashboard/stale-leads",
  handler: dashboardStaleLeads,
});
app.http("dashboardFollowUps", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "dashboard/follow-ups",
  handler: dashboardFollowUps,
});
