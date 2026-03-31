import { useCallback, useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { ToastContainer, type ToastMessage } from "../components/Toast";
import type { ApiLead, ApiLeadDocument } from "../types";
import { formatLeadStatus, LEAD_DOCUMENT_CATEGORY_LABELS, type LeadDocumentCategory } from "../types";
import { Sparkles, Printer, ArrowLeft, Loader2, RefreshCw } from "lucide-react";

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

interface AiBriefResponse {
  leadId: string;
  leadName: string;
  brief: string;
  generatedAt: string;
  usedFallback?: boolean;
  explanation?: string;
  usedWebSearch?: boolean;
  webSearchQuery?: string | null;
  webSources?: Array<{
    title: string;
    content: string;
    link: string;
    refer?: string;
    publishDate?: string;
  }>;
}

interface DemoStorageState {
  paused?: boolean;
  completedAt?: string | null;
}

function readActiveDemoState(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem("crm-demo");
    if (!raw) return false;
    const parsed = JSON.parse(raw) as DemoStorageState;
    return parsed.paused === false && parsed.completedAt == null;
  } catch {
    return false;
  }
}

function MarkdownBrief({ text }: { text: string }): JSX.Element {
  const lines = text.split("\n");
  const elements: JSX.Element[] = [];
  let listItems: string[] = [];

  const flushList = () => {
    if (listItems.length === 0) return;
    elements.push(
      <ul key={`ul-${elements.length}`} className="ml-4 space-y-1 text-sm text-slate-700 list-disc">
        {listItems.map((item, i) => <li key={i}>{item}</li>)}
      </ul>,
    );
    listItems = [];
  };

  for (const line of lines) {
    if (line.startsWith("## ")) {
      flushList();
      elements.push(
        <h3 key={`h-${elements.length}`} className="mt-5 mb-2 text-base font-bold text-slate-900 border-b border-slate-200 pb-1">
          {line.slice(3)}
        </h3>,
      );
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      listItems.push(line.slice(2));
    } else if (line.match(/^\d+\.\s/)) {
      listItems.push(line.replace(/^\d+\.\s/, ""));
    } else {
      flushList();
      if (line.trim()) {
        const formatted = line
          .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
          .replace(/\*(.+?)\*/g, "<em>$1</em>");
        elements.push(
          <p key={`p-${elements.length}`} className="text-sm text-slate-700 leading-relaxed" dangerouslySetInnerHTML={{ __html: formatted }} />,
        );
      }
    }
  }
  flushList();

  return <div className="space-y-1">{elements}</div>;
}

export function PrepSheet(): JSX.Element {
  const [params] = useSearchParams();
  const leadId = params.get("leadId");
  const [lead, setLead] = useState<ApiLead | null>(null);
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [aiBrief, setAiBrief] = useState<AiBriefResponse | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiLoadingStartedAt, setAiLoadingStartedAt] = useState<string | null>(null);
  const [demoActive, setDemoActive] = useState<boolean>(() => readActiveDemoState());

  const addToast = useCallback((type: ToastMessage["type"], message: string) => {
    setToasts((prev) => [...prev, { id: Date.now() + Math.random(), type, message }]);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    if (!leadId) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const data = await apiFetch<ApiLead>(`/leads/${leadId}`);
        setLead(data);
      } catch (e) {
        addToast("error", e instanceof Error ? e.message : "Unable to load lead");
      } finally {
        setLoading(false);
      }
    })();
  }, [addToast, leadId]);

  useEffect(() => {
    const syncDemoState = (event: Event) => {
      const detail = (event as CustomEvent<boolean>).detail;
      setDemoActive(typeof detail === "boolean" ? detail : readActiveDemoState());
    };

    window.addEventListener("crm-demo-active", syncDemoState);
    return () => window.removeEventListener("crm-demo-active", syncDemoState);
  }, []);

  const generateBrief = useCallback(async () => {
    if (!leadId) return;
    setAiLoading(true);
    setAiLoadingStartedAt(new Date().toISOString());
    try {
      const data = await apiFetch<AiBriefResponse>(`/leads/${leadId}/ai-brief`, { method: "POST" });
      setAiBrief(data);
      if (data.usedFallback) {
        if (!demoActive) {
          addToast("warning", data.explanation ?? "Generated a CRM-based fallback brief");
        }
      } else {
        addToast("success", "AI brief generated");
      }
    } catch (e) {
      addToast("error", e instanceof Error ? e.message : "AI brief generation failed");
    } finally {
      setAiLoading(false);
      setAiLoadingStartedAt(null);
    }
  }, [addToast, demoActive, leadId]);

  if (!leadId) {
    return (
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900">Pre-call Prep Sheet</h2>
        <p className="text-sm text-slate-600">Open a lead detail and click <strong>Prep Sheet</strong> to generate a brief, or add <code>?leadId=…</code> to the URL.</p>
      </section>
    );
  }

  if (loading) {
    return (
      <section className="space-y-4 p-6">
        <div className="h-6 w-64 animate-pulse rounded bg-slate-200" />
        <div className="h-80 animate-pulse rounded-xl bg-slate-100" />
      </section>
    );
  }

  if (!lead) {
    return (
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900">Lead not found</h2>
        <Link to="/leads" className="text-blue-600 hover:underline">Back to Leads</Link>
      </section>
    );
  }

  const addressLine = [lead.addressLine1, [lead.city, lead.state].filter(Boolean).join(", "), lead.postalCode]
    .filter(Boolean)
    .join(" · ");

  const recentActivities = (lead.activities ?? []).slice(0, 10);
  const docs = lead.documents ?? [];

  return (
    <section className="mx-auto max-w-3xl space-y-6 print:max-w-none">
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link data-demo="prep-back-to-lead" to={`/leads?leadId=${lead.id}`} className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline">
          <ArrowLeft className="h-4 w-4" /> Back to Leads
        </Link>
        <div className="flex flex-wrap gap-2">
          <Link data-demo="prep-open-activities" to={`/activities?leadId=${lead.id}`} className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Activity
          </Link>
          <Link data-demo="prep-open-ticklers" to={`/ticklers?leadId=${lead.id}`} className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Ticklers
          </Link>
          <button
            data-demo="prep-generate"
            type="button"
            onClick={() => {
              if (aiLoading) return;
              void generateBrief();
            }}
            aria-disabled={aiLoading}
            aria-busy={aiLoading}
            className={`inline-flex items-center gap-2 rounded-lg border px-5 py-2.5 text-sm font-semibold shadow-md transition-colors ${
              aiLoading
                ? "cursor-wait border-blue-700 bg-blue-700 text-white"
                : "border-blue-700 bg-blue-700 text-white hover:bg-blue-800"
            }`}
          >
            {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {aiLoading ? "Generating Brief..." : "Generate AI Brief"}
          </button>
          <button data-demo="prep-print" onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <Printer className="h-4 w-4" /> Print
          </button>
        </div>
      </div>

      {aiLoading && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 shadow-sm">
          <div className="flex items-center gap-2 font-medium">
            <Loader2 className="h-4 w-4 animate-spin" />
            Generating a prep brief
          </div>
          <p className="mt-1 text-blue-800">
            Pulling CRM context and requesting an AI summary now. If the provider is busy, this page will fall back to a CRM-based brief instead of failing.
          </p>
          {aiLoadingStartedAt && (
            <p className="mt-1 text-xs text-blue-700">
              Started {new Date(aiLoadingStartedAt).toLocaleTimeString()}.
            </p>
          )}
        </div>
      )}

      {aiBrief && (
        <div data-tour="prep-brief" className="rounded-xl border-2 border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50 p-6 shadow-sm print:border print:border-slate-300 print:bg-white">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-blue-600" />
              <h2 className="text-lg font-bold text-slate-900">AI Outreach Brief</h2>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-500">
                Generated {new Date(aiBrief.generatedAt).toLocaleString()}
              </span>
              <button
                type="button"
                onClick={() => {
                  if (aiLoading) return;
                  void generateBrief();
                }}
                aria-disabled={aiLoading}
                className={`inline-flex items-center gap-1 rounded-md border px-3 py-1 text-xs font-medium print:hidden ${
                  aiLoading
                    ? "cursor-wait border-blue-300 bg-blue-100 text-blue-700"
                    : "border-blue-300 bg-white text-blue-700 hover:bg-blue-50"
                }`}
              >
                <RefreshCw className={`h-3 w-3 ${aiLoading ? "animate-spin" : ""}`} /> Regenerate
              </button>
            </div>
          </div>
          {aiBrief.usedFallback && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {aiBrief.explanation ?? "The live AI provider was unavailable, so this brief was generated from CRM data only."}
            </div>
          )}
          {aiBrief.webSearchQuery && (
            <div className="mb-4 rounded-lg border border-slate-200 bg-white/80 px-4 py-3 text-sm text-slate-700">
              <p className="font-semibold text-slate-900">
                {aiBrief.usedWebSearch && (aiBrief.webSources?.length ?? 0) > 0
                  ? "Public web context included"
                  : "Public web search attempted"}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Search query: <span className="font-medium text-slate-700">{aiBrief.webSearchQuery}</span>
              </p>
              {aiBrief.usedWebSearch && (aiBrief.webSources?.length ?? 0) > 0 ? (
                <ul className="mt-3 space-y-2">
                  {aiBrief.webSources!.slice(0, 4).map((source) => (
                    <li key={source.link} className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2">
                      <a href={source.link} target="_blank" rel="noreferrer" className="font-medium text-blue-700 hover:underline">
                        {source.title}
                      </a>
                      {source.content && <p className="mt-1 text-xs text-slate-600">{source.content}</p>}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-xs text-slate-600">
                  No clear public matches were attached to this brief. That is expected for fictional leads and can also happen when a real prospect has a limited public footprint.
                </p>
              )}
            </div>
          )}
          <MarkdownBrief text={aiBrief.brief} />
        </div>
      )}

      <header className="border-b border-slate-300 pb-4">
        <p className="text-xs uppercase tracking-wide text-slate-500">Deerwood Bank — Pre-call Prep Sheet</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">{lead.firstName} {lead.lastName}</h1>
        {lead.company && <p className="text-lg text-slate-700">{lead.company}</p>}
        <p className="mt-1 text-sm text-slate-500">Prepared {new Date().toLocaleDateString()}</p>
        <div data-demo="prep-workflow-note" className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 print:hidden">
          Review the brief, then return to the lead record to log the conversation and set the next follow-up.
        </div>
      </header>

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Prospect Details</h2>
          <dl className="space-y-1 text-sm text-slate-700">
            <div className="flex gap-2"><dt className="font-medium w-32 shrink-0">Status</dt><dd>{formatLeadStatus(lead.status)}</dd></div>
            <div className="flex gap-2"><dt className="font-medium w-32 shrink-0">Pipeline</dt><dd>{lead.pipelineValue ? currency.format(Number(lead.pipelineValue)) : "—"}</dd></div>
            <div className="flex gap-2"><dt className="font-medium w-32 shrink-0">Industry</dt><dd>{lead.industryCode ?? "—"}</dd></div>
            <div className="flex gap-2"><dt className="font-medium w-32 shrink-0">Source</dt><dd>{lead.source}</dd></div>
            <div className="flex gap-2"><dt className="font-medium w-32 shrink-0">Branch</dt><dd>{lead.branch ?? "—"}</dd></div>
            <div className="flex gap-2"><dt className="font-medium w-32 shrink-0">Assigned to</dt><dd>{lead.assignedTo?.displayName ?? "—"}</dd></div>
            <div className="flex gap-2"><dt className="font-medium w-32 shrink-0">Next follow-up</dt><dd>{lead.nextFollowUp ? new Date(lead.nextFollowUp).toLocaleDateString() : "—"}</dd></div>
          </dl>
        </div>
        <div className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Contact Info</h2>
          <dl className="space-y-1 text-sm text-slate-700">
            <div className="flex gap-2"><dt className="font-medium w-32 shrink-0">Email</dt><dd>{lead.email ?? "—"}</dd></div>
            <div className="flex gap-2"><dt className="font-medium w-32 shrink-0">Phone</dt><dd>{lead.phone ?? "—"}</dd></div>
            <div className="flex gap-2"><dt className="font-medium w-32 shrink-0">Address</dt><dd>{addressLine || "—"}</dd></div>
          </dl>
          {(lead.contacts?.length ?? 0) > 0 && (
            <>
              <h3 className="mt-3 text-xs font-semibold uppercase text-slate-500">Contacts at company</h3>
              <ul className="space-y-1 text-sm text-slate-700">
                {lead.contacts!.map((c) => (
                  <li key={c.id}>
                    {c.firstName} {c.lastName}
                    {c.title ? ` — ${c.title}` : ""}
                    {c.email ? ` (${c.email})` : ""}
                    {c.isPrimary ? " ★" : ""}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>

      {lead.notes && (
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Notes</h2>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{lead.notes}</p>
        </div>
      )}

      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
          Recent Activity ({recentActivities.length}{(lead.activities?.length ?? 0) > 10 ? ` of ${lead.activities!.length}` : ""})
        </h2>
        {recentActivities.length === 0 ? (
          <p className="mt-1 text-sm text-slate-500">No activity logged.</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100 text-sm">
            {recentActivities.map((a) => (
              <li key={a.id} className="py-2">
                <span className="font-medium text-slate-800">{a.type}</span>{" "}
                <span className="text-slate-700">{a.subject}</span>
                <span className="ml-2 text-xs text-slate-500">{new Date(a.createdAt).toLocaleDateString()}</span>
                {a.description && <p className="mt-0.5 text-xs text-slate-600">{a.description}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Documents on file ({docs.length})</h2>
        {docs.length === 0 ? (
          <p className="mt-1 text-sm text-slate-500">None uploaded.</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100 text-sm">
            {docs.map((d: ApiLeadDocument) => (
              <li key={d.id} className="py-1.5">
                <span className="font-medium text-slate-800">{d.fileName}</span>{" "}
                <span className="text-xs text-slate-500">
                  ({LEAD_DOCUMENT_CATEGORY_LABELS[d.category as LeadDocumentCategory]} · {formatBytes(d.sizeBytes)} · {new Date(d.createdAt).toLocaleDateString()})
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <footer className="border-t border-slate-200 pt-3 text-xs text-slate-400 print:block">
        Confidential — Deerwood Bank internal use only. Generated {new Date().toLocaleString()}.
      </footer>
    </section>
  );
}
