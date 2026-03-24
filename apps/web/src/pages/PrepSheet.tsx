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

  const generateBrief = useCallback(async () => {
    if (!leadId) return;
    setAiLoading(true);
    setAiBrief(null);
    try {
      const data = await apiFetch<AiBriefResponse>(`/leads/${leadId}/ai-brief`, { method: "POST" });
      setAiBrief(data);
      addToast("success", "AI brief generated");
    } catch (e) {
      addToast("error", e instanceof Error ? e.message : "AI brief generation failed");
    } finally {
      setAiLoading(false);
    }
  }, [addToast, leadId]);

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
        <Link to="/leads" className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline">
          <ArrowLeft className="h-4 w-4" /> Back to Leads
        </Link>
        <div className="flex gap-2">
          <button
            onClick={generateBrief}
            disabled={aiLoading}
            className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md hover:from-blue-700 hover:to-indigo-700 disabled:opacity-60 transition-all"
          >
            {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {aiLoading ? "Generating Brief..." : "Generate AI Brief"}
          </button>
          <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <Printer className="h-4 w-4" /> Print
          </button>
        </div>
      </div>

      {aiBrief && (
        <div className="rounded-xl border-2 border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50 p-6 shadow-sm print:border print:border-slate-300 print:bg-white">
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
                onClick={generateBrief}
                disabled={aiLoading}
                className="inline-flex items-center gap-1 rounded-md border border-blue-300 bg-white px-3 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50 print:hidden"
              >
                <RefreshCw className={`h-3 w-3 ${aiLoading ? "animate-spin" : ""}`} /> Regenerate
              </button>
            </div>
          </div>
          <MarkdownBrief text={aiBrief.brief} />
        </div>
      )}

      <header className="border-b border-slate-300 pb-4">
        <p className="text-xs uppercase tracking-wide text-slate-500">Deerwood Bank — Pre-call Prep Sheet</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">{lead.firstName} {lead.lastName}</h1>
        {lead.company && <p className="text-lg text-slate-700">{lead.company}</p>}
        <p className="mt-1 text-sm text-slate-500">Prepared {new Date().toLocaleDateString()}</p>
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
