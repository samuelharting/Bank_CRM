import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { prisma } from "../db/client.js";
import { corsHeaders, handleCorsPreflight, requireAuth } from "../middleware/auth.js";

export async function notifications(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const preflight = handleCorsPreflight(request);
  if (preflight) return preflight;
  const auth = await requireAuth(request, context);
  if ("response" in auth) return auth.response;

  try {
    const method = request.method.toUpperCase();
    const id = request.params.id;

    if (method === "GET" && request.url.includes("/count")) {
      const unread = await prisma.notification.count({ where: { userId: auth.user.id, isRead: false } });
      return { status: 200, headers: corsHeaders(), jsonBody: { unread } };
    }

    if (method === "GET") {
      const list = await prisma.notification.findMany({
        where: { userId: auth.user.id },
        orderBy: { createdAt: "desc" },
        take: 50,
      });
      return { status: 200, headers: corsHeaders(), jsonBody: { notifications: list } };
    }

    if (method === "PUT" && request.url.includes("/read-all")) {
      await prisma.notification.updateMany({ where: { userId: auth.user.id, isRead: false }, data: { isRead: true } });
      return { status: 200, headers: corsHeaders(), jsonBody: { success: true } };
    }

    if (method === "PUT" && id) {
      // Single-notification operations must always enforce ownership.
      const existing = await prisma.notification.findUnique({
        where: { id },
        select: { id: true, userId: true },
      });
      if (!existing) {
        return { status: 404, headers: corsHeaders(), jsonBody: { error: "Notification not found" } };
      }
      if (existing.userId !== auth.user.id) {
        return { status: 403, headers: corsHeaders(), jsonBody: { error: "Access denied" } };
      }
      const updated = await prisma.notification.update({
        where: { id },
        data: { isRead: true },
      });
      return { status: 200, headers: corsHeaders(), jsonBody: updated };
    }

    return { status: 405, headers: corsHeaders(), jsonBody: { error: "Method not allowed" } };
  } catch (error) {
    context.error("notifications endpoint failed", error);
    const message = error instanceof Error ? error.message : "Unexpected server error";
    return { status: 500, headers: corsHeaders(), jsonBody: { error: "Request failed", details: message } };
  }
}

app.http("notificationsList", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "notifications",
  handler: notifications,
});

app.http("notificationsRead", {
  methods: ["PUT", "OPTIONS"],
  authLevel: "anonymous",
  route: "notifications/{id}/read",
  handler: notifications,
});

app.http("notificationsReadAll", {
  methods: ["PUT", "OPTIONS"],
  authLevel: "anonymous",
  route: "notifications/read-all",
  handler: notifications,
});

app.http("notificationsCount", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "notifications/count",
  handler: notifications,
});
