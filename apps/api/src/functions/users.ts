import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { prisma } from "../db/client.js";
import { corsHeaders, handleCorsPreflight, requireAuth } from "../middleware/auth.js";

export async function users(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const preflight = handleCorsPreflight(request);
  if (preflight) return preflight;

  const auth = await requireAuth(request, context);
  if ("response" in auth) return auth.response;

  try {
    // This endpoint is intentionally available to all authenticated users because
    // the web app needs a shared people directory for assignment/filter dropdowns.
    // Keep the response limited to non-sensitive profile fields.
    const usersList = await prisma.user.findMany({
      where: { isActive: true },
      orderBy: { displayName: "asc" },
      select: { id: true, displayName: true, email: true, branch: true, role: true },
    });
    return { status: 200, headers: corsHeaders(), jsonBody: usersList };
  } catch (error) {
    context.error("Users endpoint failed", error);
    const message = error instanceof Error ? error.message : "Unexpected server error";
    return { status: 500, headers: corsHeaders(), jsonBody: { error: "Request failed", details: message } };
  }
}

app.http("usersList", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "users",
  handler: users,
});
