import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { prisma } from "../db/client.js";
import { corsHeaders, handleCorsPreflight, requireAuth } from "../middleware/auth.js";
import { leadScopeWhere } from "../middleware/scope.js";
import { callLlm } from "../services/llm.js";

const SYSTEM_PROMPT = `You are a senior commercial lending advisor at a community bank in rural Minnesota. A lender is about to call on a prospect and needs a concise, actionable prep brief.

You will receive structured CRM data about this prospect. Based ONLY on the data provided, generate a brief with these sections:

## Prospect Summary
2-3 sentence overview of who this prospect is, their business, and where they stand in the pipeline.

## Relationship History
Summarize previous interactions — what was discussed, what was promised, what's outstanding. If no activity exists, note that this is a fresh prospect.

## Documents on File
Note what documents have been uploaded and what they might tell us. If none, say so.

## Suggested Talking Points
3-5 specific, concrete things the lender should bring up on this call based on the data. Reference real details from the CRM.

## Recommended Questions to Ask
3-5 discovery questions tailored to this prospect's situation, industry, and pipeline stage.

## Suggested Next Steps
What should happen after this call? Be specific about follow-up timing and actions.

## Draft Follow-Up Email
Write a short, professional follow-up email the lender could send after the call. Use the prospect's name and company. Keep it under 150 words.

Rules:
- Use ONLY the data provided. Do not invent facts.
- Be specific — reference real names, amounts, dates, and activity details from the CRM data.
- Write for a banker, not a tech person.
- If data is thin, say so honestly and suggest what information to gather.
- Keep the entire brief under 800 words.`;

const buildUserPrompt = (lead: Record<string, unknown>): string => {
  const activities = (lead.activities as Array<Record<string, unknown>>) ?? [];
  const contacts = (lead.contacts as Array<Record<string, unknown>>) ?? [];
  const documents = (lead.documents as Array<Record<string, unknown>>) ?? [];

  const activityLines = activities.slice(0, 15).map((a) => {
    const date = new Date(a.createdAt as string).toLocaleDateString();
    const user = (a.user as Record<string, unknown>)?.displayName ?? "Unknown";
    return `- ${date} | ${a.type} | ${a.subject}${a.description ? ` — ${(a.description as string).slice(0, 200)}` : ""} (by ${user})`;
  });

  const contactLines = contacts.map((c) =>
    `- ${c.firstName} ${c.lastName}${c.title ? ` (${c.title})` : ""}${c.email ? ` — ${c.email}` : ""}${c.isPrimary ? " [PRIMARY]" : ""}`,
  );

  const docLines = documents.map((d) => {
    const date = new Date(d.createdAt as string).toLocaleDateString();
    return `- ${d.fileName} (${d.category}, ${date})`;
  });

  const assignedTo = (lead.assignedTo as Record<string, unknown>)?.displayName ?? "Unassigned";
  const pipeline = lead.pipelineValue ? `$${Number(lead.pipelineValue).toLocaleString()}` : "Not set";
  const followUp = lead.nextFollowUp ? new Date(lead.nextFollowUp as string).toLocaleDateString() : "None scheduled";
  const address = [lead.addressLine1, lead.city, lead.state, lead.postalCode].filter(Boolean).join(", ");

  return `PROSPECT DATA:
Name: ${lead.firstName} ${lead.lastName}
Company: ${lead.company ?? "No company"}
Industry Code: ${lead.industryCode ?? "Not set"}
Status: ${lead.status}
Pipeline Value: ${pipeline}
Source: ${lead.source}
Branch: ${lead.branch ?? "Not set"}
Assigned To: ${assignedTo}
Next Follow-Up: ${followUp}
Email: ${lead.email ?? "None"}
Phone: ${lead.phone ?? "None"}
Address: ${address || "None"}
Notes: ${lead.notes ?? "None"}

CONTACTS AT COMPANY (${contactLines.length}):
${contactLines.length > 0 ? contactLines.join("\n") : "No contacts on file."}

ACTIVITY HISTORY (${activities.length} total, showing last ${activityLines.length}):
${activityLines.length > 0 ? activityLines.join("\n") : "No activity logged yet."}

DOCUMENTS ON FILE (${docLines.length}):
${docLines.length > 0 ? docLines.join("\n") : "No documents uploaded."}`;
};

export async function aiPrepBrief(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const preflight = handleCorsPreflight(request);
  if (preflight) return preflight;

  const auth = await requireAuth(request, context);
  if ("response" in auth) return auth.response;

  try {
    const leadId = request.params.leadId;
    if (!leadId) {
      return { status: 400, headers: corsHeaders(), jsonBody: { error: "leadId is required" } };
    }

    const scope = leadScopeWhere(auth.user);
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      include: {
        contacts: true,
        activities: { include: { user: true }, orderBy: { createdAt: "desc" }, take: 15 },
        documents: { orderBy: { createdAt: "desc" } },
        assignedTo: true,
      },
    });

    if (!lead) {
      return { status: 404, headers: corsHeaders(), jsonBody: { error: "Lead not found" } };
    }

    const allowed = await prisma.lead.count({ where: { AND: [{ id: lead.id }, scope] } });
    if (!allowed) {
      return { status: 403, headers: corsHeaders(), jsonBody: { error: "Access denied" } };
    }

    const userPrompt = buildUserPrompt(lead as unknown as Record<string, unknown>);

    const brief = await callLlm(
      { system: SYSTEM_PROMPT, user: userPrompt, maxTokens: 2000, temperature: 0.4 },
      context,
    );

    return {
      status: 200,
      headers: corsHeaders(),
      jsonBody: {
        leadId: lead.id,
        leadName: `${lead.firstName} ${lead.lastName}`,
        brief,
        generatedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    context.error("AI prep brief failed", error);
    const message = error instanceof Error ? error.message : "Unexpected error";
    return { status: 500, headers: corsHeaders(), jsonBody: { error: "AI brief generation failed", details: message } };
  }
}

app.http("aiPrepBrief", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "leads/{leadId}/ai-brief",
  handler: aiPrepBrief,
});
