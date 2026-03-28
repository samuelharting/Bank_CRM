import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db/client.js";
import { corsHeaders, handleCorsPreflight, requireAuth } from "../middleware/auth.js";
import { isReadOnlyRole, leadScopeWhere } from "../middleware/scope.js";
import { ContactInput } from "../types/index.js";

const parseBody = async (request: HttpRequest): Promise<ContactInput> => {
  const body = (await request.json()) as Partial<ContactInput>;
  if (!body.firstName || !body.lastName || !body.leadId) {
    throw new Error("Missing required fields: firstName, lastName, leadId");
  }
  return {
    firstName: body.firstName,
    lastName: body.lastName,
    leadId: body.leadId,
    email: body.email,
    phone: body.phone,
    title: body.title,
    isPrimary: body.isPrimary,
    notes: body.notes,
  };
};

export async function contacts(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const preflight = handleCorsPreflight(request);
  if (preflight) return preflight;

  const auth = await requireAuth(request, context);
  if ("response" in auth) return auth.response;

  try {
    const id = request.params.id;
    const method = request.method.toUpperCase();

    if (method === "GET") {
      const leadScope = leadScopeWhere(auth.user);
      if (id) {
        const contact = await prisma.contact.findUnique({
          where: { id },
          include: { lead: { include: { activities: { orderBy: { createdAt: "desc" }, include: { user: true } } } } },
        });
        if (!contact) return { status: 404, headers: corsHeaders(), jsonBody: { error: "Contact not found" } };
        const allowed = await prisma.lead.count({ where: { AND: [{ id: contact.leadId }, leadScope] } });
        if (!allowed) return { status: 403, headers: corsHeaders(), jsonBody: { error: "Access denied" } };
        return { status: 200, headers: corsHeaders(), jsonBody: contact };
      }

      const page = Number(request.query.get("page") ?? "1");
      const pageSize = Number(request.query.get("pageSize") ?? "25");
      const search = request.query.get("search")?.trim();
      const branch = request.query.get("branch");
      const leadStatus = request.query.get("leadStatus");
      const sortBy = request.query.get("sortBy") ?? "name";
      const sortOrder = request.query.get("sortOrder") === "asc" ? "asc" : "desc";

      const where: Prisma.ContactWhereInput = {
        lead: {
          AND: [
            leadScope,
            {
              ...(branch && branch !== "ALL" ? { branch } : {}),
              ...(leadStatus && leadStatus !== "ALL" ? { status: leadStatus as never } : {}),
            },
          ],
        },
      };

      if (search) {
        where.OR = [
          { firstName: { contains: search, mode: "insensitive" } },
          { lastName: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
          { phone: { contains: search, mode: "insensitive" } },
          { lead: { company: { contains: search, mode: "insensitive" } } },
        ];
      }

      const orderBy: Prisma.ContactOrderByWithRelationInput =
        sortBy === "company"
          ? { lead: { company: sortOrder } }
          : sortBy === "createdAt"
            ? { createdAt: sortOrder }
            : { lastName: sortOrder };

      const [results, total] = await Promise.all([
        prisma.contact.findMany({
          where,
          include: { lead: { include: { assignedTo: true } } },
          orderBy,
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        prisma.contact.count({ where }),
      ]);
      return { status: 200, headers: corsHeaders(), jsonBody: { results, total, page, pageSize } };
    }

    if (method === "POST") {
      if (isReadOnlyRole(auth.user.role)) return { status: 403, headers: corsHeaders(), jsonBody: { error: "Role is read-only" } };
      const body = await parseBody(request);
      const allowed = await prisma.lead.count({ where: { AND: [{ id: body.leadId }, leadScopeWhere(auth.user)] } });
      if (!allowed) return { status: 403, headers: corsHeaders(), jsonBody: { error: "Access denied" } };
      const created = await prisma.contact.create({ data: body });
      return { status: 201, headers: corsHeaders(), jsonBody: created };
    }

    if (method === "PUT" && id) {
      if (isReadOnlyRole(auth.user.role)) return { status: 403, headers: corsHeaders(), jsonBody: { error: "Role is read-only" } };
      const body = await parseBody(request);
      const allowed = await prisma.lead.count({ where: { AND: [{ id: body.leadId }, leadScopeWhere(auth.user)] } });
      if (!allowed) return { status: 403, headers: corsHeaders(), jsonBody: { error: "Access denied" } };
      const updated = await prisma.contact.update({ where: { id }, data: body });
      return { status: 200, headers: corsHeaders(), jsonBody: updated };
    }

    if (method === "DELETE" && id) {
      if (isReadOnlyRole(auth.user.role)) return { status: 403, headers: corsHeaders(), jsonBody: { error: "Role is read-only" } };
      const contact = await prisma.contact.findUnique({ where: { id }, select: { leadId: true } });
      if (!contact) return { status: 404, headers: corsHeaders(), jsonBody: { error: "Contact not found" } };
      const allowed = await prisma.lead.count({ where: { AND: [{ id: contact.leadId }, leadScopeWhere(auth.user)] } });
      if (!allowed) return { status: 403, headers: corsHeaders(), jsonBody: { error: "Access denied" } };
      await prisma.contact.delete({ where: { id } });
      return { status: 204, headers: corsHeaders() };
    }

    return { status: 405, headers: corsHeaders(), jsonBody: { error: "Method not allowed" } };
  } catch (error) {
    context.error("Contact endpoint failed", error);
    const message = error instanceof Error ? error.message : "Unexpected server error";
    return { status: 500, headers: corsHeaders(), jsonBody: { error: "Request failed", details: message } };
  }
}

app.http("contactsCollection", {
  methods: ["GET", "POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "contacts",
  handler: contacts,
});

app.http("contactById", {
  methods: ["GET", "PUT", "DELETE", "OPTIONS"],
  authLevel: "anonymous",
  route: "contacts/{id}",
  handler: contacts,
});
