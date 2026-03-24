import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { LeadStatus, Prisma, UserRole } from "@prisma/client";
import { prisma } from "../db/client.js";
import { corsHeaders, handleCorsPreflight, requireAuth } from "../middleware/auth.js";
import { leadScopeWhere } from "../middleware/scope.js";

const num = (v: Prisma.Decimal | number | null | undefined): number => (v ? Number(v) : 0);

const withError = (context: InvocationContext, label: string, error: unknown): HttpResponseInit => {
  context.error(label, error);
  const message = error instanceof Error ? error.message : "Unexpected server error";
  return { status: 500, headers: corsHeaders(), jsonBody: { error: "Request failed", details: message } };
};

const canViewReports = (role: UserRole): boolean =>
  role === UserRole.BRANCH_MANAGER ||
  role === UserRole.EXECUTIVE ||
  role === UserRole.ADMIN ||
  role === UserRole.COMPLIANCE_READONLY;

export async function reportPipelineByOfficer(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const preflight = handleCorsPreflight(request);
  if (preflight) return preflight;
  const auth = await requireAuth(request, context);
  if ("response" in auth) return auth.response;
  if (!canViewReports(auth.user.role)) {
    return { status: 403, headers: corsHeaders(), jsonBody: { error: "Reports require manager+ role" } };
  }

  try {
    const scope = leadScopeWhere(auth.user);
    const branchFilter = request.query.get("branch");

    const leads = await prisma.lead.findMany({
      where: {
        AND: [
          scope,
          { status: { in: [LeadStatus.PROSPECT, LeadStatus.CONTACTED, LeadStatus.QUALIFIED, LeadStatus.PROPOSAL] } },
          branchFilter ? { branch: branchFilter } : {},
        ],
      },
      include: { assignedTo: { select: { id: true, displayName: true, branch: true } } },
    });

    const byOfficer: Record<string, { displayName: string; branch: string | null; count: number; totalPipeline: number }> = {};
    for (const lead of leads) {
      const key = lead.assignedToId;
      if (!byOfficer[key]) {
        byOfficer[key] = {
          displayName: lead.assignedTo?.displayName ?? "Unknown",
          branch: lead.assignedTo?.branch ?? null,
          count: 0,
          totalPipeline: 0,
        };
      }
      byOfficer[key].count += 1;
      byOfficer[key].totalPipeline += num(lead.pipelineValue);
    }

    const rows = Object.entries(byOfficer)
      .map(([id, d]) => ({ officerId: id, ...d }))
      .sort((a, b) => b.totalPipeline - a.totalPipeline);

    return { status: 200, headers: corsHeaders(), jsonBody: { rows } };
  } catch (error) {
    return withError(context, "reportPipelineByOfficer failed", error);
  }
}

export async function reportConversion(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const preflight = handleCorsPreflight(request);
  if (preflight) return preflight;
  const auth = await requireAuth(request, context);
  if ("response" in auth) return auth.response;
  if (!canViewReports(auth.user.role)) {
    return { status: 403, headers: corsHeaders(), jsonBody: { error: "Reports require manager+ role" } };
  }

  try {
    const scope = leadScopeWhere(auth.user);
    const daysStr = request.query.get("days") ?? "90";
    const days = Math.min(365, Math.max(7, Number(daysStr)));
    const since = new Date(Date.now() - days * 86400000);
    const branchFilter = request.query.get("branch");

    const leads = await prisma.lead.findMany({
      where: {
        AND: [
          scope,
          { createdAt: { gte: since } },
          branchFilter ? { branch: branchFilter } : {},
        ],
      },
      select: { status: true, assignedToId: true, pipelineValue: true },
    });

    const byStatus: Record<string, { count: number; pipeline: number }> = {};
    for (const lead of leads) {
      const s = lead.status;
      if (!byStatus[s]) byStatus[s] = { count: 0, pipeline: 0 };
      byStatus[s].count += 1;
      byStatus[s].pipeline += num(lead.pipelineValue);
    }

    const totalLeads = leads.length;
    const wonCount = byStatus[LeadStatus.WON]?.count ?? 0;

    return {
      status: 200,
      headers: corsHeaders(),
      jsonBody: {
        days,
        totalLeads,
        wonCount,
        conversionRate: totalLeads > 0 ? Math.round((wonCount / totalLeads) * 1000) / 10 : 0,
        byStatus: Object.entries(byStatus).map(([status, d]) => ({ status, ...d })),
      },
    };
  } catch (error) {
    return withError(context, "reportConversion failed", error);
  }
}

export async function reportActivityVolume(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const preflight = handleCorsPreflight(request);
  if (preflight) return preflight;
  const auth = await requireAuth(request, context);
  if ("response" in auth) return auth.response;
  if (!canViewReports(auth.user.role)) {
    return { status: 403, headers: corsHeaders(), jsonBody: { error: "Reports require manager+ role" } };
  }

  try {
    const daysStr = request.query.get("days") ?? "30";
    const days = Math.min(365, Math.max(7, Number(daysStr)));
    const since = new Date(Date.now() - days * 86400000);
    const branchFilter = request.query.get("branch");

    const scope = leadScopeWhere(auth.user);
    const activities = await prisma.activity.findMany({
      where: {
        createdAt: { gte: since },
        lead: { AND: [scope, branchFilter ? { branch: branchFilter } : {}] },
      },
      include: { user: { select: { id: true, displayName: true } } },
    });

    const byOfficer: Record<string, { displayName: string; CALL: number; EMAIL: number; MEETING: number; NOTE: number; FOLLOW_UP: number; total: number }> = {};
    for (const a of activities) {
      const key = a.userId;
      if (!byOfficer[key]) {
        byOfficer[key] = { displayName: a.user?.displayName ?? "Unknown", CALL: 0, EMAIL: 0, MEETING: 0, NOTE: 0, FOLLOW_UP: 0, total: 0 };
      }
      byOfficer[key][a.type] += 1;
      byOfficer[key].total += 1;
    }

    const rows = Object.entries(byOfficer)
      .map(([officerId, d]) => ({ officerId, ...d }))
      .sort((a, b) => b.total - a.total);

    return { status: 200, headers: corsHeaders(), jsonBody: { days, rows } };
  } catch (error) {
    return withError(context, "reportActivityVolume failed", error);
  }
}

export async function reportStaleLeads(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const preflight = handleCorsPreflight(request);
  if (preflight) return preflight;
  const auth = await requireAuth(request, context);
  if ("response" in auth) return auth.response;

  try {
    const scope = leadScopeWhere(auth.user);
    const daysStr = request.query.get("days") ?? "14";
    const days = Math.min(365, Math.max(1, Number(daysStr)));
    const cutoff = new Date(Date.now() - days * 86400000);
    const branchFilter = request.query.get("branch");

    const leads = await prisma.lead.findMany({
      where: {
        AND: [
          scope,
          { status: { in: [LeadStatus.PROSPECT, LeadStatus.CONTACTED, LeadStatus.QUALIFIED, LeadStatus.PROPOSAL] } },
          { updatedAt: { lt: cutoff } },
          branchFilter ? { branch: branchFilter } : {},
        ],
      },
      include: {
        assignedTo: { select: { displayName: true } },
        activities: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { updatedAt: "asc" },
      take: 100,
    });

    const rows = leads.map((l) => ({
      id: l.id,
      name: `${l.firstName} ${l.lastName}`,
      company: l.company,
      status: l.status,
      pipelineValue: num(l.pipelineValue),
      assignedTo: l.assignedTo?.displayName ?? "Unknown",
      branch: l.branch,
      lastActivity: l.activities[0]?.createdAt ?? null,
      updatedAt: l.updatedAt,
    }));

    return { status: 200, headers: corsHeaders(), jsonBody: { days, rows } };
  } catch (error) {
    return withError(context, "reportStaleLeads failed", error);
  }
}

app.http("reportPipelineByOfficer", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "reports/pipeline-by-officer",
  handler: reportPipelineByOfficer,
});

app.http("reportConversion", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "reports/conversion",
  handler: reportConversion,
});

app.http("reportActivityVolume", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "reports/activity-volume",
  handler: reportActivityVolume,
});

app.http("reportStaleLeads", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "reports/stale-leads",
  handler: reportStaleLeads,
});
