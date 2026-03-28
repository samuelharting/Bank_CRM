import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import type { LeadStatus as LeadStatusType } from "@prisma/client";
import pkg from "@prisma/client";
const { LeadStatus } = pkg;
import { prisma } from "../db/client.js";
import { corsHeaders, handleCorsPreflight, requireAuth } from "../middleware/auth.js";
import { leadScopeWhere } from "../middleware/scope.js";

const activeStatuses = [LeadStatus.PROSPECT, LeadStatus.CONTACTED, LeadStatus.QUALIFIED, LeadStatus.PROPOSAL, LeadStatus.WON];

export async function mapLeads(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const preflight = handleCorsPreflight(request);
  if (preflight) return preflight;
  const auth = await requireAuth(request, context);
  if ("response" in auth) return auth.response;

  try {
    const scope = leadScopeWhere(auth.user);
    const branch = request.query.get("branch");
    const status = request.query.get("status");
    const assignedToId = request.query.get("assignedToId");

    const leads = await prisma.lead.findMany({
      where: {
        AND: [
          scope,
          { latitude: { not: null }, longitude: { not: null } },
          { status: { in: status ? [status as LeadStatusType] : activeStatuses } },
          branch ? { branch } : {},
          assignedToId && assignedToId !== "ALL" ? { assignedToId } : {},
        ],
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        company: true,
        city: true,
        state: true,
        status: true,
        pipelineValue: true,
        latitude: true,
        longitude: true,
        branch: true,
        assignedTo: { select: { displayName: true } },
      },
      take: 1000,
    });

    const markers = leads.map((l) => ({
      id: l.id,
      name: `${l.firstName} ${l.lastName}`,
      company: l.company,
      city: l.city,
      state: l.state,
      status: l.status,
      pipelineValue: l.pipelineValue ? Number(l.pipelineValue) : 0,
      lat: l.latitude!,
      lng: l.longitude!,
      branch: l.branch,
      assignedTo: l.assignedTo?.displayName ?? null,
    }));

    return { status: 200, headers: corsHeaders(), jsonBody: { markers } };
  } catch (error) {
    context.error("mapLeads failed", error);
    return { status: 500, headers: corsHeaders(), jsonBody: { error: "Request failed" } };
  }
}

export async function geocodeBatch(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const preflight = handleCorsPreflight(request);
  if (preflight) return preflight;
  const auth = await requireAuth(request, context);
  if ("response" in auth) return auth.response;

  try {
    const scope = leadScopeWhere(auth.user);
    const leads = await prisma.lead.findMany({
      where: {
        AND: [
          scope,
          { latitude: null },
          { OR: [{ city: { not: null } }, { postalCode: { not: null } }, { addressLine1: { not: null } }] },
        ],
      },
      select: { id: true, addressLine1: true, city: true, state: true, postalCode: true },
      take: 50,
    });

    let geocoded = 0;
    for (const lead of leads) {
      const parts = [lead.addressLine1, lead.city, lead.state, lead.postalCode].filter(Boolean).join(", ");
      if (!parts) continue;

      try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(parts)}`;
        const res = await fetch(url, { headers: { "User-Agent": "DeerwooodBankCRM/1.0" } });
        const data = (await res.json()) as { lat: string; lon: string }[];
        if (data.length > 0) {
          await prisma.lead.update({
            where: { id: lead.id },
            data: { latitude: parseFloat(data[0].lat), longitude: parseFloat(data[0].lon) },
          });
          geocoded += 1;
        }
        await new Promise((r) => setTimeout(r, 1100));
      } catch {
        /* Nominatim may rate-limit; skip */
      }
    }

    return { status: 200, headers: corsHeaders(), jsonBody: { processed: leads.length, geocoded } };
  } catch (error) {
    context.error("geocodeBatch failed", error);
    return { status: 500, headers: corsHeaders(), jsonBody: { error: "Request failed" } };
  }
}

app.http("mapLeads", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "map/leads",
  handler: mapLeads,
});

app.http("geocodeBatch", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "map/geocode",
  handler: geocodeBatch,
});
