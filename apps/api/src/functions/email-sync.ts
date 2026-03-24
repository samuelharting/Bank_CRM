import { app, HttpRequest, HttpResponseInit, InvocationContext, Timer } from "@azure/functions";
import { prisma } from "../db/client.js";
import { corsHeaders, handleCorsPreflight, requireAuth } from "../middleware/auth.js";
import { syncEmailsForAllUsers, syncEmailsForUser } from "../services/email-sync.js";

export async function emailSyncTimer(timer: Timer, context: InvocationContext): Promise<void> {
  context.log("Email sync timer triggered", timer.scheduleStatus);
  await syncEmailsForAllUsers();
}

export async function emailSyncStatus(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const preflight = handleCorsPreflight(request);
  if (preflight) return preflight;
  const auth = await requireAuth(request, context);
  if ("response" in auth) return auth.response;

  try {
    const status = await prisma.emailSyncStatus.findUnique({ where: { userId: auth.user.id } });
    return {
      status: 200,
      headers: corsHeaders(),
      jsonBody: {
        lastSyncAt: status?.lastSyncAt ?? null,
        emailsMatched: status?.emailsMatched ?? 0,
        emailsSkipped: status?.emailsSkipped ?? 0,
      },
    };
  } catch (error) {
    context.error("emailSyncStatus failed", error);
    return { status: 500, headers: corsHeaders(), jsonBody: { error: "Unable to get sync status" } };
  }
}

export async function emailManualSync(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const preflight = handleCorsPreflight(request);
  if (preflight) return preflight;
  const auth = await requireAuth(request, context);
  if ("response" in auth) return auth.response;

  try {
    const result = await syncEmailsForUser(auth.user.id);
    return { status: 200, headers: corsHeaders(), jsonBody: result };
  } catch (error) {
    context.error("emailManualSync failed", error);
    const message = error instanceof Error ? error.message : "Sync failed";
    return { status: 500, headers: corsHeaders(), jsonBody: { error: "Sync failed", details: message } };
  }
}

app.timer("emailSyncTimer", {
  schedule: "0 */15 * * * *",
  handler: emailSyncTimer,
});

app.http("emailSyncStatus", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "emails/sync-status",
  handler: emailSyncStatus,
});

app.http("emailManualSync", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "emails/manual-sync",
  handler: emailManualSync,
});
