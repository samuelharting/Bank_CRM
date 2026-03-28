import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { prisma } from "../db/client.js";
import { corsHeaders, handleCorsPreflight, isDevAuthBypassEnabled } from "../middleware/auth.js";

const DB_TIMEOUT_MS = 5000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`Database operation timed out after ${ms}ms`)), ms)),
  ]);
}

/**
 * Public list of active users for the local dev login picker.
 * Disabled in production and when DEV_AUTH_BYPASS is not set (returns 404).
 */
export async function devUsers(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const preflight = handleCorsPreflight(request);
  if (preflight) return preflight;

  if (request.method.toUpperCase() !== "GET") {
    return { status: 405, headers: corsHeaders(), jsonBody: { error: "Method not allowed" } };
  }

  if (!isDevAuthBypassEnabled()) {
    return { status: 404, headers: corsHeaders(), jsonBody: { error: "Not found" } };
  }

  try {
    const users = await withTimeout(
      prisma.user.findMany({
        where: { isActive: true },
        orderBy: { displayName: "asc" },
        select: { id: true, displayName: true, email: true, branch: true, role: true },
      }),
      DB_TIMEOUT_MS,
    );
    return { status: 200, headers: corsHeaders(), jsonBody: { users } };
  } catch (error) {
    context.error("devUsers failed", error);
    return { status: 500, headers: corsHeaders(), jsonBody: { error: "Failed to load users" } };
  }
}

app.http("devUsers", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "auth/dev-users",
  handler: devUsers,
});
