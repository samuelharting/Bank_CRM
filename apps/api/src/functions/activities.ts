import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { ActivityType, Prisma } from "@prisma/client";
import { prisma } from "../db/client.js";
import { corsHeaders, handleCorsPreflight, requireAuth } from "../middleware/auth.js";
import { activityScopeWhere, isReadOnlyRole, leadScopeWhere } from "../middleware/scope.js";
import { ActivityInput } from "../types/index.js";

const parseBody = async (request: HttpRequest): Promise<ActivityInput> => {
  const body = (await request.json()) as Partial<ActivityInput>;
  if (!body.type || !body.subject || !body.leadId) {
    throw new Error("Missing required fields: type, subject, leadId");
  }
  return {
    type: body.type,
    subject: body.subject,
    leadId: body.leadId,
    description: body.description,
    scheduledAt: body.scheduledAt,
    completedAt: body.completedAt,
  };
};

export async function activities(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const preflight = handleCorsPreflight(request);
  if (preflight) return preflight;

  const auth = await requireAuth(request, context);
  if ("response" in auth) return auth.response;

  try {
    const id = request.params.id;
    const method = request.method.toUpperCase();

    if (method === "GET") {
      if (request.url.includes("/calendar")) {
        const month = request.query.get("month");
        if (!month) return { status: 400, headers: corsHeaders(), jsonBody: { error: "month is required (YYYY-MM)" } };
        const start = new Date(`${month}-01T00:00:00.000Z`);
        const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
        const data = await prisma.activity.groupBy({
          by: ["type", "scheduledAt"],
          where: {
            AND: [activityScopeWhere(auth.user), { OR: [{ scheduledAt: { gte: start, lt: end } }, { completedAt: { gte: start, lt: end } }] }],
          },
          _count: { _all: true },
        });
        const grouped = data.reduce<Record<string, Record<string, number>>>((acc, row) => {
          const date = (row.scheduledAt ?? new Date()).toISOString().slice(0, 10);
          if (!acc[date]) acc[date] = {};
          acc[date][row.type] = (acc[date][row.type] ?? 0) + row._count._all;
          return acc;
        }, {});
        return { status: 200, headers: corsHeaders(), jsonBody: { days: grouped } };
      }

      if (id) {
        const activity = await prisma.activity.findUnique({
          where: { id },
          include: { lead: true, user: true },
        });
        if (!activity) return { status: 404, headers: corsHeaders(), jsonBody: { error: "Activity not found" } };
        const allowed = await prisma.lead.count({ where: { AND: [{ id: activity.leadId }, leadScopeWhere(auth.user)] } });
        if (!allowed) return { status: 403, headers: corsHeaders(), jsonBody: { error: "Access denied" } };
        return { status: 200, headers: corsHeaders(), jsonBody: activity };
      }

      const page = Number(request.query.get("page") ?? "1");
      const pageSize = Number(request.query.get("pageSize") ?? "25");
      const type = request.query.get("type");
      const userId = request.query.get("userId");
      const branch = request.query.get("branch");
      const startDate = request.query.get("startDate");
      const endDate = request.query.get("endDate");
      const completion = request.query.get("completion");
      const where: Prisma.ActivityWhereInput = {
        AND: [
          activityScopeWhere(auth.user),
          {
            ...(type && type !== "ALL" ? { type: type as ActivityType } : {}),
            ...(userId && userId !== "ALL" ? { userId } : {}),
            ...(branch && branch !== "ALL" ? { lead: { branch } } : {}),
            ...(completion === "completed"
              ? { completedAt: { not: null } }
              : completion === "scheduled"
                ? { completedAt: null, scheduledAt: { not: null } }
                : {}),
            ...(startDate || endDate
              ? {
                  OR: [
                    {
                      createdAt: {
                        gte: startDate ? new Date(startDate) : undefined,
                        lte: endDate ? new Date(endDate) : undefined,
                      },
                    },
                    {
                      scheduledAt: {
                        gte: startDate ? new Date(startDate) : undefined,
                        lte: endDate ? new Date(endDate) : undefined,
                      },
                    },
                  ],
                }
              : {}),
          },
        ],
      };

      const [results, total] = await Promise.all([
        prisma.activity.findMany({
          where,
          include: { lead: true, user: true },
          orderBy: [{ completedAt: "desc" }, { scheduledAt: "asc" }, { createdAt: "desc" }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        prisma.activity.count({ where }),
      ]);
      return { status: 200, headers: corsHeaders(), jsonBody: { results, total, page, pageSize } };
    }

    if (method === "POST") {
      if (isReadOnlyRole(auth.user.role)) return { status: 403, headers: corsHeaders(), jsonBody: { error: "Role is read-only" } };
      const body = await parseBody(request);
      const allowed = await prisma.lead.count({ where: { AND: [{ id: body.leadId }, leadScopeWhere(auth.user)] } });
      if (!allowed) return { status: 403, headers: corsHeaders(), jsonBody: { error: "Access denied" } };
      const created = await prisma.activity.create({
        data: {
          type: body.type as ActivityType,
          subject: body.subject,
          leadId: body.leadId,
          userId: auth.user.id,
          description: body.description,
          scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : undefined,
          completedAt: body.completedAt ? new Date(body.completedAt) : undefined,
        },
      });
      return { status: 201, headers: corsHeaders(), jsonBody: created };
    }

    if (method === "PUT" && id) {
      if (isReadOnlyRole(auth.user.role)) return { status: 403, headers: corsHeaders(), jsonBody: { error: "Role is read-only" } };
      const body = await parseBody(request);
      const existing = await prisma.activity.findUnique({ where: { id }, select: { leadId: true } });
      if (!existing) return { status: 404, headers: corsHeaders(), jsonBody: { error: "Activity not found" } };
      const [existingAllowed, targetAllowed] = await Promise.all([
        prisma.lead.count({ where: { AND: [{ id: existing.leadId }, leadScopeWhere(auth.user)] } }),
        prisma.lead.count({ where: { AND: [{ id: body.leadId }, leadScopeWhere(auth.user)] } }),
      ]);
      if (!existingAllowed || !targetAllowed) return { status: 403, headers: corsHeaders(), jsonBody: { error: "Access denied" } };
      const updated = await prisma.activity.update({
        where: { id },
        data: {
          type: body.type,
          subject: body.subject,
          leadId: body.leadId,
          description: body.description,
          scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : undefined,
          completedAt: body.completedAt ? new Date(body.completedAt) : undefined,
        },
      });
      return { status: 200, headers: corsHeaders(), jsonBody: updated };
    }

    if (method === "DELETE" && id) {
      if (isReadOnlyRole(auth.user.role)) return { status: 403, headers: corsHeaders(), jsonBody: { error: "Role is read-only" } };
      const existing = await prisma.activity.findUnique({ where: { id }, select: { leadId: true } });
      if (!existing) return { status: 404, headers: corsHeaders(), jsonBody: { error: "Activity not found" } };
      const allowed = await prisma.lead.count({ where: { AND: [{ id: existing.leadId }, leadScopeWhere(auth.user)] } });
      if (!allowed) return { status: 403, headers: corsHeaders(), jsonBody: { error: "Access denied" } };
      await prisma.activity.delete({ where: { id } });
      return { status: 204, headers: corsHeaders() };
    }

    return { status: 405, headers: corsHeaders(), jsonBody: { error: "Method not allowed" } };
  } catch (error) {
    context.error("Activity endpoint failed", error);
    const message = error instanceof Error ? error.message : "Unexpected server error";
    return { status: 500, headers: corsHeaders(), jsonBody: { error: "Request failed", details: message } };
  }
}

app.http("activitiesCollection", {
  methods: ["GET", "POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "activities",
  handler: activities,
});

app.http("activityById", {
  methods: ["GET", "PUT", "DELETE", "OPTIONS"],
  authLevel: "anonymous",
  route: "activities/{id}",
  handler: activities,
});

app.http("activitiesCalendar", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "activities/calendar",
  handler: activities,
});
