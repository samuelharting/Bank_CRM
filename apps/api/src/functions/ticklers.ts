import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import type { Prisma, TicklerRecurrence as TicklerRecurrenceType } from "@prisma/client";
import pkg from "@prisma/client";
const { TicklerRecurrence } = pkg;
import { prisma } from "../db/client.js";
import { corsHeaders, handleCorsPreflight, requireAuth } from "../middleware/auth.js";
import { isReadOnlyRole, leadScopeWhere } from "../middleware/scope.js";
import { AuthenticatedUser } from "../types/index.js";

interface TicklerInput {
  leadId: string;
  title: string;
  notes?: string;
  dueAt: string;
  recurrence?: TicklerRecurrenceType;
}

const parseTickler = async (request: HttpRequest): Promise<TicklerInput> => {
  const body = (await request.json()) as Partial<TicklerInput>;
  if (!body.leadId || !body.title || !body.dueAt) {
    throw new Error("leadId, title, and dueAt are required");
  }
  return {
    leadId: body.leadId,
    title: body.title,
    notes: body.notes,
    dueAt: body.dueAt,
    recurrence: body.recurrence ?? TicklerRecurrence.NONE,
  };
};

const ticklerScopeWhere = (user: AuthenticatedUser): Prisma.TicklerWhereInput => ({
  lead: leadScopeWhere(user),
});

const advanceDueDate = (current: Date, recurrence: TicklerRecurrenceType): Date => {
  const next = new Date(current);
  switch (recurrence) {
    case TicklerRecurrence.DAILY:
      next.setDate(next.getDate() + 1);
      break;
    case TicklerRecurrence.WEEKLY:
      next.setDate(next.getDate() + 7);
      break;
    case TicklerRecurrence.BIWEEKLY:
      next.setDate(next.getDate() + 14);
      break;
    case TicklerRecurrence.MONTHLY:
      next.setMonth(next.getMonth() + 1);
      break;
    case TicklerRecurrence.QUARTERLY:
      next.setMonth(next.getMonth() + 3);
      break;
    default:
      break;
  }
  return next;
};

export async function ticklersHandler(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const preflight = handleCorsPreflight(request);
  if (preflight) return preflight;

  const auth = await requireAuth(request, context);
  if ("response" in auth) return auth.response;

  const method = request.method.toUpperCase();
  const id = request.params.id;

  try {
    if (method === "GET" && !id) {
      const scope = ticklerScopeWhere(auth.user);
      const filter = request.query.get("filter") ?? "upcoming";
      const now = new Date();

      let dateWhere: Prisma.TicklerWhereInput = {};
      if (filter === "overdue") {
        dateWhere = { dueAt: { lt: now }, completedAt: null, OR: [{ snoozedUntil: null }, { snoozedUntil: { lt: now } }] };
      } else if (filter === "today") {
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const end = new Date(start.getTime() + 86400000);
        dateWhere = { dueAt: { gte: start, lt: end }, completedAt: null };
      } else if (filter === "completed") {
        dateWhere = { completedAt: { not: null } };
      } else {
        dateWhere = { dueAt: { gte: now }, completedAt: null };
      }

      const ownerFilter = request.query.get("ownerId");
      const leadFilter = request.query.get("leadId");

      const where: Prisma.TicklerWhereInput = {
        AND: [
          scope,
          dateWhere,
          ownerFilter ? { ownerId: ownerFilter } : {},
          leadFilter ? { leadId: leadFilter } : {},
        ],
      };

      const page = Math.max(1, Number(request.query.get("page") ?? "1"));
      const pageSize = Math.min(100, Math.max(1, Number(request.query.get("pageSize") ?? "50")));

      const [results, total] = await Promise.all([
        prisma.tickler.findMany({
          where,
          orderBy: { dueAt: filter === "completed" ? "desc" : "asc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: {
            lead: { select: { id: true, firstName: true, lastName: true, company: true } },
            owner: { select: { id: true, displayName: true } },
          },
        }),
        prisma.tickler.count({ where }),
      ]);

      return { status: 200, headers: corsHeaders(), jsonBody: { results, total, page, pageSize } };
    }

    if (method === "GET" && id) {
      const tickler = await prisma.tickler.findUnique({
        where: { id },
        include: {
          lead: { select: { id: true, firstName: true, lastName: true, company: true } },
          owner: { select: { id: true, displayName: true } },
        },
      });
      if (!tickler) return { status: 404, headers: corsHeaders(), jsonBody: { error: "Tickler not found" } };
      const allowed = await prisma.tickler.count({ where: { AND: [{ id }, ticklerScopeWhere(auth.user)] } });
      if (!allowed) return { status: 403, headers: corsHeaders(), jsonBody: { error: "Access denied" } };
      return { status: 200, headers: corsHeaders(), jsonBody: tickler };
    }

    if (method === "POST") {
      if (isReadOnlyRole(auth.user.role)) {
        return { status: 403, headers: corsHeaders(), jsonBody: { error: "Role is read-only" } };
      }
      const body = await parseTickler(request);
      const leadOk = await prisma.lead.count({ where: { AND: [{ id: body.leadId }, leadScopeWhere(auth.user)] } });
      if (!leadOk) return { status: 403, headers: corsHeaders(), jsonBody: { error: "Access denied to lead" } };

      const tickler = await prisma.tickler.create({
        data: {
          leadId: body.leadId,
          ownerId: auth.user.id,
          title: body.title,
          notes: body.notes,
          dueAt: new Date(body.dueAt),
          recurrence: body.recurrence ?? TicklerRecurrence.NONE,
        },
        include: {
          lead: { select: { id: true, firstName: true, lastName: true, company: true } },
          owner: { select: { id: true, displayName: true } },
        },
      });

      return { status: 201, headers: corsHeaders(), jsonBody: tickler };
    }

    if (method === "PUT" && id) {
      if (isReadOnlyRole(auth.user.role)) {
        return { status: 403, headers: corsHeaders(), jsonBody: { error: "Role is read-only" } };
      }
      const existing = await prisma.tickler.findFirst({ where: { id, ...ticklerScopeWhere(auth.user) } });
      if (!existing) return { status: 404, headers: corsHeaders(), jsonBody: { error: "Tickler not found" } };

      const body = (await request.json()) as Record<string, unknown>;
      const data: Prisma.TicklerUncheckedUpdateInput = {};
      if (body.title) data.title = String(body.title);
      if (body.notes !== undefined) data.notes = body.notes ? String(body.notes) : null;
      if (body.dueAt) data.dueAt = new Date(String(body.dueAt));
      if (body.recurrence) data.recurrence = String(body.recurrence) as TicklerRecurrenceType;

      const updated = await prisma.tickler.update({
        where: { id },
        data,
        include: {
          lead: { select: { id: true, firstName: true, lastName: true, company: true } },
          owner: { select: { id: true, displayName: true } },
        },
      });
      return { status: 200, headers: corsHeaders(), jsonBody: updated };
    }

    if (method === "DELETE" && id) {
      if (isReadOnlyRole(auth.user.role)) {
        return { status: 403, headers: corsHeaders(), jsonBody: { error: "Role is read-only" } };
      }
      const existing = await prisma.tickler.findFirst({ where: { id, ...ticklerScopeWhere(auth.user) } });
      if (!existing) return { status: 404, headers: corsHeaders(), jsonBody: { error: "Tickler not found" } };
      await prisma.tickler.delete({ where: { id } });
      return { status: 200, headers: corsHeaders(), jsonBody: { ok: true } };
    }

    return { status: 405, headers: corsHeaders(), jsonBody: { error: "Method not allowed" } };
  } catch (error) {
    context.error("Tickler endpoint failed", error);
    const message = error instanceof Error ? error.message : "Unexpected server error";
    return { status: 500, headers: corsHeaders(), jsonBody: { error: "Request failed", details: message } };
  }
}

export async function ticklerComplete(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const preflight = handleCorsPreflight(request);
  if (preflight) return preflight;

  const auth = await requireAuth(request, context);
  if ("response" in auth) return auth.response;
  if (isReadOnlyRole(auth.user.role)) {
    return { status: 403, headers: corsHeaders(), jsonBody: { error: "Role is read-only" } };
  }

  const id = request.params.id;
  if (!id) return { status: 400, headers: corsHeaders(), jsonBody: { error: "Tickler id required" } };

  try {
    const existing = await prisma.tickler.findFirst({ where: { id, ...ticklerScopeWhere(auth.user) } });
    if (!existing) return { status: 404, headers: corsHeaders(), jsonBody: { error: "Tickler not found" } };

    await prisma.tickler.update({ where: { id }, data: { completedAt: new Date() } });

    if (existing.recurrence !== TicklerRecurrence.NONE) {
      const nextDue = advanceDueDate(existing.dueAt, existing.recurrence);
      await prisma.tickler.create({
        data: {
          leadId: existing.leadId,
          ownerId: existing.ownerId,
          title: existing.title,
          notes: existing.notes,
          dueAt: nextDue,
          recurrence: existing.recurrence,
        },
      });
    }

    return { status: 200, headers: corsHeaders(), jsonBody: { ok: true, recurred: existing.recurrence !== TicklerRecurrence.NONE } };
  } catch (error) {
    context.error("Tickler complete failed", error);
    return { status: 500, headers: corsHeaders(), jsonBody: { error: "Request failed" } };
  }
}

export async function ticklerSnooze(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const preflight = handleCorsPreflight(request);
  if (preflight) return preflight;

  const auth = await requireAuth(request, context);
  if ("response" in auth) return auth.response;
  if (isReadOnlyRole(auth.user.role)) {
    return { status: 403, headers: corsHeaders(), jsonBody: { error: "Role is read-only" } };
  }

  const id = request.params.id;
  if (!id) return { status: 400, headers: corsHeaders(), jsonBody: { error: "Tickler id required" } };

  try {
    const body = (await request.json()) as { until?: string };
    if (!body.until) return { status: 400, headers: corsHeaders(), jsonBody: { error: "until is required" } };

    const existing = await prisma.tickler.findFirst({ where: { id, ...ticklerScopeWhere(auth.user) } });
    if (!existing) return { status: 404, headers: corsHeaders(), jsonBody: { error: "Tickler not found" } };

    const updated = await prisma.tickler.update({
      where: { id },
      data: { snoozedUntil: new Date(body.until), dueAt: new Date(body.until) },
    });
    return { status: 200, headers: corsHeaders(), jsonBody: updated };
  } catch (error) {
    context.error("Tickler snooze failed", error);
    return { status: 500, headers: corsHeaders(), jsonBody: { error: "Request failed" } };
  }
}

app.http("ticklersCollection", {
  methods: ["GET", "POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "ticklers",
  handler: ticklersHandler,
});

app.http("ticklerById", {
  methods: ["GET", "PUT", "DELETE", "OPTIONS"],
  authLevel: "anonymous",
  route: "ticklers/{id}",
  handler: ticklersHandler,
});

app.http("ticklerComplete", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "ticklers/{id}/complete",
  handler: ticklerComplete,
});

app.http("ticklerSnooze", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "ticklers/{id}/snooze",
  handler: ticklerSnooze,
});
