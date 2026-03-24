import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { corsHeaders, handleCorsPreflight } from "../middleware/auth.js";

export async function healthcheck(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const preflight = handleCorsPreflight(request);
  if (preflight) return preflight;

  context.log("Healthcheck request received");
  return {
    status: 200,
    headers: corsHeaders(),
    jsonBody: {
      status: "ok",
      service: "deerwood-crm-api",
      timestamp: new Date().toISOString(),
    },
  };
}

app.http("healthcheck", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "health",
  handler: healthcheck,
});
