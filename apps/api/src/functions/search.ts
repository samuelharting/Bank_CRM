import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { Prisma } from "@prisma/client";
import { prisma } from "../db/client.js";
import { corsHeaders, handleCorsPreflight, requireAuth } from "../middleware/auth.js";
import { leadScopeWhere } from "../middleware/scope.js";
import { SearchRequestBody, type AuthenticatedUser } from "../types/index.js";
import { callLlm } from "../services/llm.js";

interface SearchModelResponse {
  where?: Prisma.LeadWhereInput;
  orderBy?: Prisma.LeadOrderByWithRelationInput;
  include?: Prisma.LeadInclude;
  explanation?: string;
}

/** Same shape as the leads list endpoint — never trust model-provided `include` (invalid graphs cause 500s). */
const SEARCH_LIST_INCLUDE: Prisma.LeadInclude = {
  assignedTo: true,
  activities: {
    orderBy: { createdAt: "desc" },
    take: 1,
    include: { user: true },
  },
};

const extractJson = (raw: string): SearchModelResponse => {
  let trimmed = raw.trim();
  const fence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/m);
  if (fence) trimmed = fence[1].trim();
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1) throw new Error("Model did not return JSON");
  const jsonText = trimmed.slice(firstBrace, lastBrace + 1);
  return JSON.parse(jsonText) as SearchModelResponse;
};

const isPrismaValidationError = (e: unknown): boolean =>
  e instanceof Error && e.name === "PrismaClientValidationError";

const buildPrompt = (): string => `You are a SQL query assistant for a bank CRM. Convert natural language queries into Prisma where clauses.

The database has these models:
- Lead: id, firstName, lastName, company, email, phone, industryCode, addressLine1, city, state, postalCode, latitude (float), longitude (float), source (REFERRAL|WALK_IN|PHONE|WEBSITE|EVENT|EXISTING_CLIENT|OTHER), status (PROSPECT|CONTACTED|QUALIFIED|PROPOSAL|WON|LOST|DORMANT), pipelineValue (decimal), notes, nextFollowUp (datetime), branch, assignedToId, createdAt, updatedAt
- User: id, email, displayName, role, branch
- Contact: id, firstName, lastName, email, phone, title, isPrimary, leadId
- Activity: id, type (CALL|EMAIL|MEETING|NOTE|FOLLOW_UP), subject, description, scheduledAt, completedAt, leadId, userId, createdAt

Return ONLY a valid JSON object with:
{
  "where": { /* Prisma LeadWhereInput only — scalar fields on Lead, use enums exactly as listed */ },
  "orderBy": { /* optional — only Lead scalar/relation order fields, e.g. { "createdAt": "desc" } or { "pipelineValue": "desc" } */ },
  "explanation": "Brief explanation of what this query does"
}

Omit "include" — the server sets includes. Do not nest User/Contact/Activity filters inside "include".

Today's date is: ${new Date().toISOString().split("T")[0]}

Do not return anything except the JSON object. No markdown, no backticks, no explanation outside the JSON.`;

const runLeadSearch = async (
  user: AuthenticatedUser,
  parsedWhere: Prisma.LeadWhereInput | undefined,
  orderBy: Prisma.LeadOrderByWithRelationInput | undefined,
): Promise<{
  results: Awaited<ReturnType<typeof prisma.lead.findMany>>;
  usedFallback: boolean;
}> => {
  const scope = leadScopeWhere(user);
  const fullWhere: Prisma.LeadWhereInput = { AND: [parsedWhere ?? {}, scope] };
  const ob = orderBy ?? { createdAt: "desc" };
  try {
    const results = await prisma.lead.findMany({
      where: fullWhere,
      orderBy: ob,
      include: SEARCH_LIST_INCLUDE,
      take: 200,
    });
    return { results, usedFallback: false };
  } catch (e) {
    if (!isPrismaValidationError(e)) throw e;
    // Invalid model-generated where/orderBy — still return 200 with scoped list
    const results = await prisma.lead.findMany({
      where: { AND: [scope] },
      orderBy: { createdAt: "desc" },
      include: SEARCH_LIST_INCLUDE,
      take: 200,
    });
    return { results, usedFallback: true };
  }
};

const parseSearchModelResponse = async (query: string, context: InvocationContext): Promise<SearchModelResponse> => {
  try {
    return await getModelJson(query, context);
  } catch (first) {
    context.log("search: JSON parse failed, retrying LLM once", first);
    return await getModelJson(
      query,
      context,
      `Your last reply was not valid JSON. Error: ${first instanceof Error ? first.message : String(first)}.`,
    );
  }
};

const getModelJson = async (query: string, context: InvocationContext, repairHint?: string): Promise<SearchModelResponse> => {
  const userContent = repairHint
    ? `${repairHint}\n\nOriginal request: ${query}\nReturn ONLY one JSON object with keys "where", optional "orderBy", and "explanation". Use only Lead table fields in "where".`
    : query;
  const text = await callLlm(
    { system: buildPrompt(), user: userContent, maxTokens: 1024, temperature: 0.1 },
    context,
  );
  return extractJson(text);
};

export async function search(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const preflight = handleCorsPreflight(request);
  if (preflight) return preflight;

  const auth = await requireAuth(request, context);
  if ("response" in auth) return auth.response;

  try {
    const body = (await request.json()) as SearchRequestBody;
    if (!body.query?.trim()) {
      return { status: 400, headers: corsHeaders(), jsonBody: { error: "query is required" } };
    }

    const parsed = await parseSearchModelResponse(body.query.trim(), context);
    const { results, usedFallback } = await runLeadSearch(auth.user, parsed.where, parsed.orderBy);

    let explanation = parsed.explanation ?? "AI search results";
    if (usedFallback) {
      explanation +=
        " Some filters from the AI could not be applied safely, so results show all leads in your access scope (newest first).";
    }

    return {
      status: 200,
      headers: corsHeaders(),
      jsonBody: {
        results,
        explanation,
        count: results.length,
        usedFallback,
      },
    };
  } catch (error) {
    context.error("Search endpoint failed", error);
    const message = error instanceof Error ? error.message : "Unexpected server error";
    return { status: 500, headers: corsHeaders(), jsonBody: { error: "Search failed", details: message } };
  }
}

app.http("search", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "search",
  handler: search,
});
