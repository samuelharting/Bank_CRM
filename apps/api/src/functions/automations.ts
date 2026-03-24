import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { AutomationAction, AutomationTrigger, UserRole } from "@prisma/client";
import { prisma } from "../db/client.js";
import { corsHeaders, handleCorsPreflight, requireAuth } from "../middleware/auth.js";

const requireAdmin = (role: UserRole): boolean => role === UserRole.ADMIN;

export async function automations(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const preflight = handleCorsPreflight(request);
  if (preflight) return preflight;
  const auth = await requireAuth(request, context);
  if ("response" in auth) return auth.response;
  if (!requireAdmin(auth.user.role)) {
    return { status: 403, headers: corsHeaders(), jsonBody: { error: "Admin access required" } };
  }

  try {
    const method = request.method.toUpperCase();
    const id = request.params.id;

    if (method === "GET" && id && request.url.includes("/logs")) {
      const page = Number(request.query.get("page") ?? "1");
      const pageSize = Number(request.query.get("pageSize") ?? "25");
      const [logs, total] = await Promise.all([
        prisma.automationLog.findMany({
          where: { automationId: id },
          orderBy: { executedAt: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        prisma.automationLog.count({ where: { automationId: id } }),
      ]);
      return { status: 200, headers: corsHeaders(), jsonBody: { logs, total, page, pageSize } };
    }

    if (method === "GET") {
      const list = await prisma.automation.findMany({
        orderBy: { updatedAt: "desc" },
        include: {
          _count: {
            select: { logs: true },
          },
        },
      });
      return { status: 200, headers: corsHeaders(), jsonBody: { automations: list } };
    }

    if (method === "POST") {
      const body = (await request.json()) as {
        name: string;
        description?: string;
        trigger: AutomationTrigger;
        conditions: unknown;
        action: AutomationAction;
        actionConfig: unknown;
      };
      const created = await prisma.automation.create({
        data: {
          name: body.name,
          description: body.description,
          trigger: body.trigger,
          conditions: body.conditions as object,
          action: body.action,
          actionConfig: body.actionConfig as object,
          createdById: auth.user.id,
        },
      });
      return { status: 201, headers: corsHeaders(), jsonBody: created };
    }

    if (method === "PUT" && id) {
      const body = (await request.json()) as {
        name?: string;
        description?: string;
        isActive?: boolean;
        trigger?: AutomationTrigger;
        conditions?: unknown;
        action?: AutomationAction;
        actionConfig?: unknown;
      };
      const updated = await prisma.automation.update({
        where: { id },
        data: {
          name: body.name,
          description: body.description,
          isActive: body.isActive,
          trigger: body.trigger,
          conditions: body.conditions as object | undefined,
          action: body.action,
          actionConfig: body.actionConfig as object | undefined,
        },
      });
      return { status: 200, headers: corsHeaders(), jsonBody: updated };
    }

    if (method === "DELETE" && id) {
      const updated = await prisma.automation.update({ where: { id }, data: { isActive: false } });
      return { status: 200, headers: corsHeaders(), jsonBody: updated };
    }

    return { status: 405, headers: corsHeaders(), jsonBody: { error: "Method not allowed" } };
  } catch (error) {
    context.error("automations endpoint failed", error);
    const message = error instanceof Error ? error.message : "Unexpected server error";
    return { status: 500, headers: corsHeaders(), jsonBody: { error: "Request failed", details: message } };
  }
}

app.http("automationsList", {
  methods: ["GET", "POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "automations",
  handler: automations,
});

app.http("automationById", {
  methods: ["PUT", "DELETE", "OPTIONS"],
  authLevel: "anonymous",
  route: "automations/{id}",
  handler: automations,
});

app.http("automationLogs", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "automations/{id}/logs",
  handler: automations,
});
