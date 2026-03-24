import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { isReadOnlyRole } from "../lib/roles";
import { useAuth } from "../auth/useAuth";
import { ToastContainer, type ToastMessage } from "../components/Toast";
import type { ApiUser } from "../types";

interface PreviewResponse {
  previewId: string;
  headers: string[];
  sampleRows: string[][];
  rowCount: number;
  maxRows: number;
}

interface ExecuteResponse {
  jobId: string;
  insertedCount: number;
  failedCount: number;
  skippedCount: number;
  rowCount: number;
  errors: { row: number; message: string }[];
}

interface ImportJobRow {
  id: string;
  originalFileName: string;
  insertedCount: number;
  failedCount: number;
  skippedCount: number;
  rowCount: number;
  createdAt: string;
  createdBy?: { displayName: string };
}

const FIELD_OPTIONS: { key: string; label: string; required?: boolean }[] = [
  { key: "firstName", label: "First name", required: true },
  { key: "lastName", label: "Last name", required: true },
  { key: "company", label: "Company" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "industryCode", label: "Industry code" },
  { key: "addressLine1", label: "Street address" },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
  { key: "postalCode", label: "ZIP / Postal" },
  { key: "pipelineValue", label: "Pipeline / loan amount" },
  { key: "branch", label: "Branch" },
  { key: "notes", label: "Notes" },
  { key: "nextFollowUp", label: "Next follow-up" },
  { key: "status", label: "Status (e.g. PROSPECT)" },
  { key: "source", label: "Source (e.g. REFERRAL)" },
];

function guessMapping(headers: string[]): Record<string, string> {
  const lower = headers.map((h) => h.trim().toLowerCase());
  const find = (...candidates: string[]): string => {
    for (const c of candidates) {
      const i = lower.findIndex((h) => h === c || h.includes(c));
      if (i >= 0) return headers[i];
    }
    return "";
  };
  return {
    firstName: find("first name", "firstname", "first"),
    lastName: find("last name", "lastname", "last"),
    company: find("company", "business"),
    email: find("email", "e-mail"),
    phone: find("phone", "mobile"),
    industryCode: find("industry", "naics"),
    addressLine1: find("address", "street"),
    city: find("city"),
    state: find("state"),
    postalCode: find("zip", "postal"),
    pipelineValue: find("pipeline", "loan", "amount"),
    branch: find("branch"),
    notes: find("notes"),
    nextFollowUp: find("follow", "next"),
    status: find("status"),
    source: find("source"),
  };
}

export function ImportLeads(): JSX.Element {
  const { role } = useAuth();
  const readOnly = isReadOnlyRole(role);
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [assignedToId, setAssignedToId] = useState("");
  const [uploading, setUploading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<ExecuteResponse | null>(null);
  const [jobs, setJobs] = useState<ImportJobRow[]>([]);

  const addToast = useCallback((type: ToastMessage["type"], message: string) => {
    setToasts((prev) => [...prev, { id: Date.now() + Math.random(), type, message }]);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    apiFetch<ApiUser[]>("/users")
      .then((data) => {
        setUsers(data);
        if (data[0]) setAssignedToId(data[0].id);
      })
      .catch(() => undefined);
  }, []);

  const loadJobs = useCallback(() => {
    apiFetch<{ results: ImportJobRow[] }>("/imports/jobs?limit=15")
      .then((d) => setJobs(d.results))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!readOnly) loadJobs();
  }, [loadJobs, readOnly]);

  const onFile = async (file: File | null): Promise<void> => {
    if (!file || readOnly) return;
    setUploading(true);
    setResult(null);
    setPreview(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const data = await apiFetch<PreviewResponse>("/imports/leads/preview", { method: "POST", body: fd });
      setPreview(data);
      setMapping(guessMapping(data.headers));
      addToast("success", `Loaded ${data.rowCount} rows (max ${data.maxRows} imported)`);
    } catch (error) {
      addToast("error", error instanceof Error ? error.message : "Preview failed");
    } finally {
      setUploading(false);
    }
  };

  const runImport = async (): Promise<void> => {
    if (!preview || readOnly) return;
    if (!mapping.firstName?.trim() || !mapping.lastName?.trim()) {
      addToast("error", "Map both first name and last name columns.");
      return;
    }
    if (!assignedToId) {
      addToast("error", "Choose an assigned officer.");
      return;
    }
    setExecuting(true);
    setResult(null);
    try {
      const body: Record<string, string> = {};
      for (const f of FIELD_OPTIONS) {
        const v = mapping[f.key]?.trim();
        if (v) body[f.key] = v;
      }
      const data = await apiFetch<ExecuteResponse>("/imports/leads/execute", {
        method: "POST",
        body: JSON.stringify({
          previewId: preview.previewId,
          mapping: body,
          assignedToId,
        }),
      });
      setResult(data);
      setPreview(null);
      addToast("success", `Imported ${data.insertedCount} leads`);
      loadJobs();
    } catch (error) {
      addToast("error", error instanceof Error ? error.message : "Import failed");
    } finally {
      setExecuting(false);
    }
  };

  if (readOnly) {
    return (
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900">Import leads</h2>
        <p className="text-sm text-slate-600">Your role cannot run imports.</p>
        <Link to="/leads" className="text-blue-600 hover:underline">
          Back to Leads
        </Link>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Import leads from Excel</h2>
          <p className="mt-1 text-sm text-slate-600">
            Upload a <strong>.xlsx</strong> file with a header row. Map columns, then assign an officer. Max{" "}
            {preview?.maxRows ?? 500} rows per run.
          </p>
        </div>
        <Link to="/leads" className="text-sm font-medium text-blue-600 hover:underline">
          ← Back to Leads
        </Link>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-800">1. Upload</h3>
        <input
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          disabled={uploading}
          onChange={(e) => onFile(e.target.files?.[0] ?? null).catch(() => undefined)}
          className="mt-2 block text-sm text-slate-600 file:mr-2 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm"
        />
        {uploading && <p className="mt-2 text-sm text-slate-500">Reading workbook…</p>}
      </div>

      {preview && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-800">2. Column mapping</h3>
          <p className="mt-1 text-xs text-slate-500">Pick the column header from your sheet for each field. First and last name are required.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {FIELD_OPTIONS.map((f) => (
              <label key={f.key} className="block text-sm">
                <span className="text-slate-700">
                  {f.label}
                  {f.required && <span className="text-red-600"> *</span>}
                </span>
                <select
                  value={mapping[f.key] ?? ""}
                  onChange={(e) => setMapping((prev) => ({ ...prev, [f.key]: e.target.value }))}
                  className="mt-1 w-full rounded-md border border-gray-300 px-2 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">—</option>
                  {preview.headers.map((h) => (
                    <option key={`${f.key}-${h}`} value={h}>
                      {h || "(empty)"}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          <div className="mt-4 max-h-48 overflow-auto rounded border border-slate-100 text-xs">
            <table className="min-w-full divide-y divide-slate-100">
              <thead>
                <tr className="bg-slate-50">
                  {preview.headers.map((h, i) => (
                    <th key={i} className="px-2 py-1 text-left font-medium text-slate-700">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.sampleRows.map((row, ri) => (
                  <tr key={ri} className="divide-x divide-slate-100">
                    {row.map((cell, ci) => (
                      <td key={ci} className="px-2 py-1 text-slate-600">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4">
            <label className="block text-sm font-medium text-slate-700">Assigned officer (all imported leads)</label>
            <select
              value={assignedToId}
              onChange={(e) => setAssignedToId(e.target.value)}
              className="mt-1 max-w-md rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.displayName} ({u.email})
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            disabled={executing}
            onClick={() => runImport().catch(() => undefined)}
            className="mt-4 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {executing ? "Importing…" : "3. Run import"}
          </button>
        </div>
      )}

      {result && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-900">
          <p className="font-semibold">Import finished</p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li>Inserted: {result.insertedCount}</li>
            <li>Skipped (empty / duplicate in file): {result.skippedCount}</li>
            <li>Issues logged: {result.failedCount}</li>
          </ul>
          {result.errors?.length > 0 && (
            <ul className="mt-2 max-h-32 list-inside list-disc overflow-auto text-xs">
              {result.errors.map((e) => (
                <li key={`${e.row}-${e.message}`}>
                  Row {e.row}: {e.message}
                </li>
              ))}
            </ul>
          )}
          <Link to="/leads" className="mt-3 inline-block font-medium text-green-800 underline">
            View leads
          </Link>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-800">Recent imports (you)</h3>
        {jobs.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No imports yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100 text-sm">
            {jobs.map((j) => (
              <li key={j.id} className="py-2">
                <span className="font-medium text-slate-800">{j.originalFileName}</span>
                <span className="text-slate-500">
                  {" "}
                  — {j.insertedCount} inserted · {new Date(j.createdAt).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
