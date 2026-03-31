import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { prisma } from "../db/client.js";
import { corsHeaders, handleCorsPreflight, requireAuth } from "../middleware/auth.js";
import { leadScopeWhere } from "../middleware/scope.js";
import {
  callLlmDetailed,
  getUserFacingLlmError,
  isLlmEmptyResponseError,
  isLlmRateLimitError,
  isLlmTimeoutError,
  type LlmWebSearchResult,
} from "../services/llm.js";
import { isWebSearchEnabled } from "../services/webSearch.js";

const SYSTEM_PROMPT = `You are a senior commercial lending advisor at a community bank in rural Minnesota. A lender is about to call on a prospect and needs a concise, actionable prep brief.

You will receive structured CRM data about this prospect. A public web search tool may also be available to look up the same person or company. CRM data is the source of truth. Public web research is supplemental and may be noisy.

Generate a brief with these sections:

## Prospect Summary
2-3 sentence overview of who this prospect is, their business, and where they stand in the pipeline.

## Relationship History
Summarize previous interactions: what was discussed, what was promised, what is outstanding. If no activity exists, note that this is a fresh prospect.

## Documents on File
Note what documents have been uploaded and what they might tell us. If none, say so.

## Suggested Talking Points
3-5 specific, concrete things the lender should bring up on this call based on the data. Reference real details from the CRM and public web context only when the public web context clearly matches the same person or company.

## Recommended Questions to Ask
3-5 discovery questions tailored to this prospect's situation, industry, and pipeline stage.

## Suggested Next Steps
What should happen after this call? Be specific about follow-up timing and actions.

## Draft Follow-Up Email
Write a short, professional follow-up email the lender could send after the call. Use the prospect's name and company. Keep it under 150 words.

Rules:
- CRM data is the source of truth.
- When a web search tool is available, use it to fill in missing public facts like job title, role, company description, or recent public news only when the match is clear.
- Use public web findings only when they clearly match the same person or company.
- If web results are weak or ambiguous, say that public web search did not confirm additional details.
- Do not invent facts.
- Be specific: reference real names, amounts, dates, activity details, and any clearly matched public details.
- Write for a banker, not a tech person.
- If data is thin, say so honestly and suggest what information to gather.
- Keep the entire brief under 800 words.`;

const formatCurrency = (value: unknown): string | null => {
  if (value === null || value === undefined || value === "") return null;
  const amount = Number(value);
  if (Number.isNaN(amount)) return null;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
};

const formatDate = (value: unknown): string | null => {
  if (!value || typeof value !== "string") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString();
};

const sentence = (parts: Array<string | null | undefined>): string =>
  parts
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(" ")
    .trim();

const formatContactLine = (contact: Record<string, unknown>): string => {
  const name = `${contact.firstName ?? ""} ${contact.lastName ?? ""}`.trim() || "Unknown contact";
  const suffix = [contact.title, contact.email].filter(Boolean).join(" | ");
  return suffix ? `${name} (${suffix})` : name;
};

const buildUserPrompt = (lead: Record<string, unknown>): string => {
  const activities = (lead.activities as Array<Record<string, unknown>>) ?? [];
  const contacts = (lead.contacts as Array<Record<string, unknown>>) ?? [];
  const documents = (lead.documents as Array<Record<string, unknown>>) ?? [];

  const activityLines = activities.slice(0, 15).map((activity) => {
    const date = formatDate(activity.createdAt) ?? "Unknown date";
    const user = (activity.user as Record<string, unknown> | undefined)?.displayName ?? "Unknown";
    const description =
      typeof activity.description === "string" && activity.description.trim()
        ? ` - ${activity.description.slice(0, 200)}`
        : "";
    return `- ${date} | ${activity.type} | ${activity.subject}${description} (by ${user})`;
  });

  const contactLines = contacts.map((contact) =>
    `- ${contact.firstName} ${contact.lastName}${contact.title ? ` (${contact.title})` : ""}${contact.email ? ` - ${contact.email}` : ""}${contact.isPrimary ? " [PRIMARY]" : ""}`,
  );

  const docLines = documents.map((document) => {
    const date = formatDate(document.createdAt) ?? "Unknown date";
    return `- ${document.fileName} (${document.category}, ${date})`;
  });

  const assignedTo = (lead.assignedTo as Record<string, unknown> | undefined)?.displayName ?? "Unassigned";
  const pipeline = lead.pipelineValue ? `$${Number(lead.pipelineValue).toLocaleString()}` : "Not set";
  const followUp = formatDate(lead.nextFollowUp) ?? "None scheduled";
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
${docLines.length > 0 ? docLines.join("\n") : "No documents uploaded."}

If a web search tool is available, use it to verify missing public details such as the prospect's title, leadership role, company background, or recent public developments. Prefer CRM facts when there is any ambiguity.`;
};

const buildFallbackBrief = (lead: Record<string, unknown>, webResults: LlmWebSearchResult[]): string => {
  const contacts = ((lead.contacts as Array<Record<string, unknown>>) ?? []).slice(0, 3);
  const activities = ((lead.activities as Array<Record<string, unknown>>) ?? []).slice(0, 5);
  const documents = ((lead.documents as Array<Record<string, unknown>>) ?? []).slice(0, 5);
  const leadName = `${lead.firstName ?? ""} ${lead.lastName ?? ""}`.trim() || "This prospect";
  const company = typeof lead.company === "string" && lead.company.trim() ? lead.company.trim() : "their business";
  const status = typeof lead.status === "string" ? lead.status : "PROSPECT";
  const source = typeof lead.source === "string" ? lead.source : "UNKNOWN";
  const branch = typeof lead.branch === "string" && lead.branch.trim() ? lead.branch.trim() : null;
  const assignedTo = (lead.assignedTo as Record<string, unknown> | undefined)?.displayName;
  const pipelineValue = formatCurrency(lead.pipelineValue);
  const nextFollowUp = formatDate(lead.nextFollowUp);
  const notes = typeof lead.notes === "string" && lead.notes.trim() ? lead.notes.trim() : null;
  const recentActivity = activities[0];
  const recentActivityDate = formatDate(recentActivity?.createdAt);
  const recentActivitySummary = recentActivity
    ? sentence([
        typeof recentActivity.type === "string" ? recentActivity.type : null,
        typeof recentActivity.subject === "string" ? `about ${recentActivity.subject}` : null,
        recentActivityDate ? `on ${recentActivityDate}.` : ".",
      ]).replace(/\s+\./g, ".")
    : null;
  const documentSummary =
    documents.length > 0
      ? documents
          .map((document) => {
            const label = typeof document.fileName === "string" ? document.fileName : "Unnamed document";
            const category = typeof document.category === "string" ? document.category : "OTHER";
            const createdAt = formatDate(document.createdAt);
            return `${label} (${category}${createdAt ? `, ${createdAt}` : ""})`;
          })
          .join("; ")
      : null;

  return `## Prospect Summary
${leadName} is associated with ${company} and is currently in ${status.toLowerCase()} status${pipelineValue ? ` with an estimated opportunity of ${pipelineValue}` : ""}. ${sentence([
    branch ? `The relationship is being managed through the ${branch} branch.` : null,
    assignedTo ? `${assignedTo} owns the lead.` : "The lead is not currently assigned to a named banker.",
  ])}

## Relationship History
${activities.length > 0 ? `${recentActivitySummary ?? "Recent CRM activity exists."} ${activities.length > 1 ? `There are ${activities.length} recent activities on file to review before the call.` : "This is the only recent activity on file."}` : "This appears to be a fresh prospect with no logged activity yet."} ${notes ? `Internal notes say: ${notes}` : "CRM notes are thin, so confirm current needs and timing early in the conversation."}

## Documents on File
${documentSummary ? `Documents currently on file: ${documentSummary}. Use them to confirm the prospect's current request and any underwriting readiness signals.` : "No documents are uploaded yet, so plan to ask what financials or supporting documents the prospect can share next."}

## Suggested Talking Points
- Confirm the prospect's current priorities for ${company} and whether the opportunity is still aligned with the ${status.toLowerCase()} stage.
- Reference the original source as ${source.toLowerCase().replace(/_/g, " ")} and ask what prompted their interest in Deerwood Bank.
- ${pipelineValue ? `Discuss the expected borrowing or deposit relationship size around ${pipelineValue} and confirm timing.` : "Discuss the rough size of the opportunity so pipeline value can be clarified after the call."}
- ${nextFollowUp ? `Use the scheduled follow-up date of ${nextFollowUp} to confirm whether that timeline still makes sense.` : "Agree on a specific follow-up date before ending the call."}
- ${contacts.length > 0 ? `Acknowledge key contacts already in CRM, including ${contacts.map(formatContactLine).join("; ")}.` : "Identify the main decision-makers and day-to-day contacts at the company."}

## Recommended Questions to Ask
- What banking issue or growth plan made this conversation timely for ${company} right now?
- Which products are most relevant to the prospect today: credit, treasury management, deposits, or something else?
- Who else should be involved in evaluating the relationship besides ${leadName}?
- What financial information or supporting documents can they share after the call?
- What timeline are they working against for a decision or funding need?

## Suggested Next Steps
${sentence([
    "Capture any missing financial details, decision-makers, and timeline notes in CRM immediately after the conversation.",
    nextFollowUp ? `If the call goes well, keep or update the next follow-up around ${nextFollowUp}.` : "Set a dated follow-up task before closing the lead record.",
    documents.length === 0 ? "Request supporting documents if the prospect is ready to move forward." : "Review the existing documents against what the prospect says on the call.",
  ])}

## Draft Follow-Up Email
Subject: Follow-up from Deerwood Bank

Hi ${lead.firstName ?? leadName},

Thank you for taking time to speak with me about ${company}. I appreciated the chance to learn more about what you are working on and where Deerwood Bank may be able to help.

As discussed, I will follow up on the items from our conversation and keep the process moving. If you can share any additional background or documents that would be helpful, feel free to send them my way.

Best,
${assignedTo ?? "Deerwood Bank"}${
    webResults.length > 0
      ? `\n\n## Public Web Context\n${webResults
          .slice(0, 4)
          .map((result) => `- ${result.title}: ${result.content || result.link}${result.link ? ` (${result.link})` : ""}`)
          .join("\n")}`
      : ""
  }`;
};

const buildWebSearchQueries = (lead: {
  firstName: string;
  lastName: string;
  company: string | null;
  city: string | null;
  state: string | null;
}): string[] => {
  const name = `${lead.firstName} ${lead.lastName}`.trim();
  const company = lead.company?.trim();
  const location = [lead.city, lead.state].filter(Boolean).join(" ").trim();
  const queries = new Set<string>();

  if (name && company) {
    queries.add(`"${name}" "${company}" ${location}`.trim());
    queries.add(`"${name}" "${company}" title profile`);
  }
  if (company) {
    queries.add(`"${company}" leadership team ${name}`.trim());
  }
  if (name) {
    queries.add(`"${name}" ${location}`.trim());
  }

  return [...queries].filter(Boolean);
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

    const webQueries = buildWebSearchQueries(lead);
    const webSearchQuery = isWebSearchEnabled() ? webQueries[0] ?? "" : "";
    const userPrompt = buildUserPrompt(lead as unknown as Record<string, unknown>);

    try {
      const llmResponse = await callLlmDetailed(
        {
          system: SYSTEM_PROMPT,
          user: userPrompt,
          maxTokens: 1400,
          temperature: 0.4,
          webSearchQuery,
          webSearchCount: 6,
        },
        context,
      );
      const webResults = llmResponse.webSearch;

      return {
        status: 200,
        headers: corsHeaders(),
        jsonBody: {
          leadId: lead.id,
          leadName: `${lead.firstName} ${lead.lastName}`,
          brief: llmResponse.text,
          generatedAt: new Date().toISOString(),
          usedFallback: false,
          usedWebSearch: webResults.length > 0,
          webSearchQuery: webSearchQuery || null,
          webSources: webResults,
        },
      };
    } catch (error) {
      if (!isLlmRateLimitError(error) && !isLlmTimeoutError(error) && !isLlmEmptyResponseError(error)) {
        throw error;
      }

      const brief = buildFallbackBrief(lead as unknown as Record<string, unknown>, []);
      return {
        status: 200,
        headers: corsHeaders(),
        jsonBody: {
          leadId: lead.id,
          leadName: `${lead.firstName} ${lead.lastName}`,
          brief,
          generatedAt: new Date().toISOString(),
          usedFallback: true,
          explanation: `${getUserFacingLlmError(error)} Showing a CRM-based fallback brief instead.`,
          usedWebSearch: false,
          webSearchQuery: webSearchQuery || null,
          webSources: [],
        },
      };
    }
  } catch (error) {
    context.error("AI prep brief failed", error);
    const message = getUserFacingLlmError(error);
    return { status: 500, headers: corsHeaders(), jsonBody: { error: "AI brief generation failed", details: message } };
  }
}

app.http("aiPrepBrief", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "leads/{leadId}/ai-brief",
  handler: aiPrepBrief,
});
