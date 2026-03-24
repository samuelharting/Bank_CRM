import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { ActivityType, LeadSource, LeadStatus, Prisma } from "@prisma/client";
import { prisma } from "../db/client.js";
import { corsHeaders, handleCorsPreflight, requireAuth } from "../middleware/auth.js";
import { isReadOnlyRole, leadScopeWhere } from "../middleware/scope.js";
import { processLeadEventAutomations } from "../services/automation.js";
import { ActivityInput, LeadInput } from "../types/index.js";

const parseBody = async (request: HttpRequest): Promise<LeadInput> => {
  const body = (await request.json()) as Partial<LeadInput>;
  if (!body.firstName || !body.lastName || !body.assignedToId) {
    throw new Error("Missing required fields: firstName, lastName, assignedToId");
  }
  return {
    firstName: body.firstName,
    lastName: body.lastName,
    assignedToId: body.assignedToId,
    company: body.company,
    email: body.email,
    phone: body.phone,
    industryCode: body.industryCode,
    addressLine1: body.addressLine1,
    city: body.city,
    state: body.state,
    postalCode: body.postalCode,
    latitude: body.latitude,
    longitude: body.longitude,
    source: body.source,
    status: body.status,
    pipelineValue: body.pipelineValue,
    notes: body.notes,
    nextFollowUp: body.nextFollowUp,
    branch: body.branch,
  };
};

const toLeadData = (body: LeadInput): Prisma.LeadUncheckedCreateInput => ({
  firstName: body.firstName,
  lastName: body.lastName,
  company: body.company,
  email: body.email,
  phone: body.phone,
  industryCode: body.industryCode,
  addressLine1: body.addressLine1,
  city: body.city,
  state: body.state,
  postalCode: body.postalCode,
  latitude: body.latitude,
  longitude: body.longitude,
  source: body.source ?? LeadSource.OTHER,
  status: body.status ?? LeadStatus.PROSPECT,
  pipelineValue: body.pipelineValue,
  notes: body.notes,
  nextFollowUp: body.nextFollowUp ? new Date(body.nextFollowUp) : undefined,
  branch: body.branch,
  assignedToId: body.assignedToId,
});

const toLeadUpdateData = (body: LeadInput): Prisma.LeadUncheckedUpdateInput => ({
  ...toLeadData(body),
});

const getSort = (sortBy: string, sortOrder: string): Prisma.LeadOrderByWithRelationInput => {
  const direction = sortOrder === "asc" ? "asc" : "desc";
  const mapped: Record<string, Prisma.LeadOrderByWithRelationInput> = {
    name: { lastName: direction },
    company: { company: direction },
    industryCode: { industryCode: direction },
    status: { status: direction },
    pipelineValue: { pipelineValue: direction },
    branch: { branch: direction },
    nextFollowUp: { nextFollowUp: direction },
    createdAt: { createdAt: direction },
    updatedAt: { updatedAt: direction },
    /** Sort by assigned officer display name */
    assignedTo: { assignedTo: { displayName: direction } },
  };
  return mapped[sortBy] ?? { createdAt: "desc" };
};

const getListWhere = (request: HttpRequest): Prisma.LeadWhereInput => {
  const search = request.query.get("search")?.trim();
  const status = request.query.get("status");
  const assignedToId = request.query.get("assignedToId");
  const branch = request.query.get("branch");
  const source = request.query.get("source");
  const followUpStart = request.query.get("followUpStart");
  const followUpEnd = request.query.get("followUpEnd");

  const where: Prisma.LeadWhereInput = {};

  if (search) {
    where.OR = [
      { firstName: { contains: search, mode: "insensitive" } },
      { lastName: { contains: search, mode: "insensitive" } },
      { company: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
      { phone: { contains: search, mode: "insensitive" } },
      { industryCode: { contains: search, mode: "insensitive" } },
      { city: { contains: search, mode: "insensitive" } },
      { postalCode: { contains: search, mode: "insensitive" } },
    ];
  }

  if (status && status !== "ALL") where.status = status as LeadStatus;
  if (assignedToId && assignedToId !== "ALL") where.assignedToId = assignedToId;
  if (branch && branch !== "ALL") where.branch = branch;
  if (source && source !== "ALL") where.source = source as LeadSource;

  if (followUpStart || followUpEnd) {
    where.nextFollowUp = {
      gte: followUpStart ? new Date(followUpStart) : undefined,
      lte: followUpEnd ? new Date(followUpEnd) : undefined,
    };
  }

  return where;
};

export async function leads(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const preflight = handleCorsPreflight(request);
  if (preflight) return preflight;

  const auth = await requireAuth(request, context);
  if ("response" in auth) return auth.response;

  try {
    const id = request.params.id;
    const method = request.method.toUpperCase();

    if (method === "GET") {
      const scope = leadScopeWhere(auth.user);
      if (id) {
        const lead = await prisma.lead.findUnique({
          where: { id },
          include: {
            contacts: true,
            activities: { include: { user: true }, orderBy: { createdAt: "desc" } },
            documents: { include: { uploadedBy: true }, orderBy: { createdAt: "desc" } },
            assignedTo: true,
          },
        });
        if (!lead) return { status: 404, headers: corsHeaders(), jsonBody: { error: "Lead not found" } };
        const allowed = await prisma.lead.count({ where: { AND: [{ id: lead.id }, scope] } });
        if (!allowed) return { status: 403, headers: corsHeaders(), jsonBody: { error: "Access denied" } };
        return { status: 200, headers: corsHeaders(), jsonBody: lead };
      }

      const page = Number(request.query.get("page") ?? "1");
      const pageSize = Number(request.query.get("pageSize") ?? "25");
      const sortBy = request.query.get("sortBy") ?? "createdAt";
      const sortOrder = request.query.get("sortOrder") ?? "desc";

      const where = {
        AND: [getListWhere(request), scope],
      };

      const [results, total] = await Promise.all([
        prisma.lead.findMany({
          where,
          orderBy: getSort(sortBy, sortOrder),
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: {
            assignedTo: true,
            activities: {
              orderBy: { createdAt: "desc" },
              take: 1,
              include: { user: true },
            },
          },
        }),
        prisma.lead.count({ where }),
      ]);

      return {
        status: 200,
        headers: corsHeaders(),
        jsonBody: { results, total, page, pageSize },
      };
    }

    if (method === "POST") {
      if (isReadOnlyRole(auth.user.role)) {
        return { status: 403, headers: corsHeaders(), jsonBody: { error: "Role is read-only" } };
      }
      const body = await parseBody(request);
      const created = await prisma.lead.create({ data: toLeadData(body) });
      await processLeadEventAutomations({
        trigger: "LEAD_CREATED",
        lead: created,
        actorUserId: auth.user.id,
      });
      await processLeadEventAutomations({
        trigger: "LEAD_ASSIGNED",
        lead: created,
        actorUserId: auth.user.id,
      });
      return { status: 201, headers: corsHeaders(), jsonBody: created };
    }

    if (method === "PUT" && id) {
      if (isReadOnlyRole(auth.user.role)) {
        return { status: 403, headers: corsHeaders(), jsonBody: { error: "Role is read-only" } };
      }
      const allowed = await prisma.lead.count({ where: { AND: [{ id }, leadScopeWhere(auth.user)] } });
      if (!allowed) return { status: 403, headers: corsHeaders(), jsonBody: { error: "Access denied" } };
      const before = await prisma.lead.findUnique({ where: { id } });
      if (!before) return { status: 404, headers: corsHeaders(), jsonBody: { error: "Lead not found" } };
      const body = await parseBody(request);
      const updated = await prisma.lead.update({ where: { id }, data: toLeadUpdateData(body) });
      if (before.status !== updated.status) {
        await processLeadEventAutomations({
          trigger: "LEAD_STATUS_CHANGE",
          lead: updated,
          previousLead: before,
          actorUserId: auth.user.id,
        });
      }
      if (before.assignedToId !== updated.assignedToId) {
        await processLeadEventAutomations({
          trigger: "LEAD_ASSIGNED",
          lead: updated,
          previousLead: before,
          actorUserId: auth.user.id,
        });
      }
      return { status: 200, headers: corsHeaders(), jsonBody: updated };
    }

    if (method === "DELETE" && id) {
      if (isReadOnlyRole(auth.user.role)) {
        return { status: 403, headers: corsHeaders(), jsonBody: { error: "Role is read-only" } };
      }
      const allowed = await prisma.lead.count({ where: { AND: [{ id }, leadScopeWhere(auth.user)] } });
      if (!allowed) return { status: 403, headers: corsHeaders(), jsonBody: { error: "Access denied" } };
      const archived = await prisma.lead.update({ where: { id }, data: { status: LeadStatus.DORMANT } });
      /** Soft-delete: lead stays in DB with status DORMANT (not a hard delete). */
      return {
        status: 200,
        headers: corsHeaders(),
        jsonBody: { action: "archived" as const, lead: archived },
      };
    }

    return { status: 405, headers: corsHeaders(), jsonBody: { error: "Method not allowed" } };
  } catch (error) {
    context.error("Lead endpoint failed", error);
    const message = error instanceof Error ? error.message : "Unexpected server error";
    return { status: 500, headers: corsHeaders(), jsonBody: { error: "Request failed", details: message } };
  }
}

export async function leadActivities(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const preflight = handleCorsPreflight(request);
  if (preflight) return preflight;

  const auth = await requireAuth(request, context);
  if ("response" in auth) return auth.response;
  if (isReadOnlyRole(auth.user.role)) {
    return { status: 403, headers: corsHeaders(), jsonBody: { error: "Role is read-only" } };
  }

  try {
    const id = request.params.id;
    if (!id) return { status: 400, headers: corsHeaders(), jsonBody: { error: "Lead id is required" } };
    const allowed = await prisma.lead.count({ where: { AND: [{ id }, leadScopeWhere(auth.user)] } });
    if (!allowed) return { status: 403, headers: corsHeaders(), jsonBody: { error: "Access denied" } };

    const body = (await request.json()) as Partial<ActivityInput>;
    if (!body.type || !body.subject) {
      return { status: 400, headers: corsHeaders(), jsonBody: { error: "type and subject are required" } };
    }

    const activity = await prisma.activity.create({
      data: {
        leadId: id,
        userId: auth.user.id,
        type: body.type as ActivityType,
        subject: body.subject,
        description: body.description,
        scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : undefined,
        completedAt: body.completedAt ? new Date(body.completedAt) : undefined,
      },
      include: { user: true },
    });

    return { status: 201, headers: corsHeaders(), jsonBody: activity };
  } catch (error) {
    context.error("Lead activity endpoint failed", error);
    const message = error instanceof Error ? error.message : "Unexpected server error";
    return { status: 500, headers: corsHeaders(), jsonBody: { error: "Request failed", details: message } };
  }
}

app.http("leadsCollection", {
  methods: ["GET", "POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "leads",
  handler: leads,
});

app.http("leadById", {
  methods: ["GET", "PUT", "DELETE", "OPTIONS"],
  authLevel: "anonymous",
  route: "leads/{id}",
  handler: leads,
});

app.http("leadActivities", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "leads/{id}/activities",
  handler: leadActivities,
});
