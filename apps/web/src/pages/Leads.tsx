import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronUp, FileText, Mail, MoreHorizontal, Sparkles, Target, X } from "lucide-react";
import { apiFetch, apiFetchBlob } from "../lib/api";
import {
  ACTIVITY_TYPES,
  LEAD_SOURCES,
  LEAD_STATUSES,
  type ActivityType,
  LEAD_DOCUMENT_CATEGORY_LABELS,
  LEAD_DOCUMENT_CATEGORIES,
  type ApiContact,
  type ApiLead,
  type ApiLeadDocument,
  type LeadDocumentCategory,
  type ApiUser,
  type LeadSource,
  type LeadStatus,
  USER_ROLES,
  formatLeadStatus,
  formatLeadSource,
} from "../types";
import { ToastContainer, type ToastMessage } from "../components/Toast";
import { useAuth } from "../auth/useAuth";
import { isReadOnlyRole } from "../lib/roles";

const BRANCHES = [
  "Baxter",
  "Bemidji",
  "Blackduck",
  "Brainerd",
  "Deerwood",
  "Garrison",
  "Grand Rapids",
  "Hibbing",
  "Isle",
  "Nisswa",
  "Pequot Lakes",
  "Pine River",
  "Walker",
  "Crosby",
] as const;

interface LeadsListResponse {
  results: ApiLead[];
  total: number;
  page: number;
  pageSize: number;
}

interface AiSearchResponse {
  results: ApiLead[];
  explanation: string;
  count: number;
  usedFallback?: boolean;
}

interface LeadFormState {
  firstName: string;
  lastName: string;
  company: string;
  email: string;
  phone: string;
  industryCode: string;
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string;
  source: LeadSource;
  status: LeadStatus;
  pipelineValue: string;
  notes: string;
  nextFollowUp: string;
  branch: string;
  assignedToId: string;
}

const emptyLeadForm = (): LeadFormState => ({
  firstName: "",
  lastName: "",
  company: "",
  email: "",
  phone: "",
  industryCode: "",
  addressLine1: "",
  city: "",
  state: "",
  postalCode: "",
  source: "OTHER",
  status: "PROSPECT",
  pipelineValue: "",
  notes: "",
  nextFollowUp: "",
  branch: "",
  assignedToId: "",
});

const statusClasses: Record<LeadStatus, string> = {
  PROSPECT: "bg-gray-100 text-gray-700",
  CONTACTED: "bg-blue-100 text-blue-700",
  QUALIFIED: "bg-amber-100 text-amber-700",
  PROPOSAL: "bg-purple-100 text-purple-700",
  WON: "bg-green-100 text-green-700",
  LOST: "bg-red-100 text-red-700",
  DORMANT: "bg-slate-100 text-slate-700",
};

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const LEAD_STATUS_URL_SET = new Set<string>(LEAD_STATUSES);

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

function readLeadPreferences(): { defaultBranchFilter: string; leadsPerPage: number } {
  if (typeof window === "undefined") return { defaultBranchFilter: "ALL", leadsPerPage: 25 };
  try {
    const raw = window.localStorage.getItem("crm-settings");
    if (!raw) return { defaultBranchFilter: "ALL", leadsPerPage: 25 };
    const parsed = JSON.parse(raw) as { defaultBranchFilter?: string; leadsPerPage?: number };
    return {
      defaultBranchFilter: parsed.defaultBranchFilter ?? "ALL",
      leadsPerPage: parsed.leadsPerPage && [25, 50, 100].includes(parsed.leadsPerPage) ? parsed.leadsPerPage : 25,
    };
  } catch {
    return { defaultBranchFilter: "ALL", leadsPerPage: 25 };
  }
}

export function Leads(): JSX.Element {
  const prefs = readLeadPreferences();
  const { role, user } = useAuth();
  const readOnly = isReadOnlyRole(role);
  const [searchParams] = useSearchParams();
  const searchRef = useRef<HTMLInputElement>(null);
  const headerActionsRef = useRef<HTMLDivElement>(null);
  const detailActionsRef = useRef<HTMLDivElement>(null);
  const pendingTourOpenFirstLeadRef = useRef(false);
  const leadsLoadAbortRef = useRef<AbortController | null>(null);
  const leadsLoadGenRef = useRef(0);
  const [leads, setLeads] = useState<ApiLead[]>([]);
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = prefs.leadsPerPage;
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [search, setSearch] = useState("");
  const [aiMode, setAiMode] = useState(false);
  const [aiExplanation, setAiExplanation] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [assignedFilter, setAssignedFilter] = useState("ALL");
  const [branchFilter, setBranchFilter] = useState(prefs.defaultBranchFilter);
  const [sourceFilter, setSourceFilter] = useState("ALL");
  const [followUpStart, setFollowUpStart] = useState("");
  const [followUpEnd, setFollowUpEnd] = useState("");
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [headerActionsOpen, setHeaderActionsOpen] = useState(false);
  const [detailActionsOpen, setDetailActionsOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<ApiLead | null>(null);
  const [form, setForm] = useState<LeadFormState>(emptyLeadForm());
  const [detailLeadId, setDetailLeadId] = useState<string | null>(null);
  const [detailLead, setDetailLead] = useState<ApiLead | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailTab, setDetailTab] = useState<"activity" | "contacts" | "documents" | "details">("activity");
  const [docCategory, setDocCategory] = useState<LeadDocumentCategory>("OTHER");
  const [docUploading, setDocUploading] = useState(false);
  const docFileRef = useRef<HTMLInputElement>(null);
  const [activitySubject, setActivitySubject] = useState("");
  const [activityType, setActivityType] = useState<ActivityType>("FOLLOW_UP");
  const [activityDescription, setActivityDescription] = useState("");
  const [contactForm, setContactForm] = useState({
    id: "",
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    title: "",
    notes: "",
    isPrimary: false,
  });
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [activityEmailOnly, setActivityEmailOnly] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{ lastSyncAt: string | null; emailsMatched: number; emailsSkipped: number } | null>(null);

  const addToast = useCallback((type: ToastMessage["type"], message: string) => {
    setToasts((prev) => [...prev, { id: Date.now() + Math.random(), type, message }]);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const sortedUsers = useMemo(() => users, [users]);
  const currentUserRecord = useMemo(
    () => users.find((candidate) => candidate.id === user?.id) ?? null,
    [user?.id, users],
  );

  const loadUsers = useCallback(async () => {
    const data = await apiFetch<ApiUser[]>("/users");
    setUsers(data);
  }, []);

  const loadLeads = useCallback(async () => {
    leadsLoadAbortRef.current?.abort();
    const ac = new AbortController();
    leadsLoadAbortRef.current = ac;
    const gen = ++leadsLoadGenRef.current;
    setLoading(true);
    try {
      if (aiMode && search.trim()) {
        const data = await apiFetch<AiSearchResponse>("/search", {
          method: "POST",
          body: JSON.stringify({ query: search.trim() }),
          signal: ac.signal,
        });
        if (gen !== leadsLoadGenRef.current) return;
        setLeads(data.results);
        setTotal(data.count);
        setAiExplanation(data.explanation);
      } else {
        const params = new URLSearchParams({
          page: String(page),
          pageSize: String(pageSize),
          sortBy,
          sortOrder,
          search,
          status: statusFilter,
          assignedToId: assignedFilter,
          branch: branchFilter,
          source: sourceFilter,
          followUpStart,
          followUpEnd,
        });
        const data = await apiFetch<LeadsListResponse>(`/leads?${params.toString()}`, { signal: ac.signal });
        if (gen !== leadsLoadGenRef.current) return;
        setLeads(data.results);
        setTotal(data.total);
        setAiExplanation("");
      }
    } catch (error) {
      const aborted =
        (typeof DOMException !== "undefined" && error instanceof DOMException && error.name === "AbortError") ||
        (error instanceof Error && error.name === "AbortError");
      if (aborted) return;
      if (gen !== leadsLoadGenRef.current) return;
      addToast("error", error instanceof Error ? error.message : "Unable to load leads");
    } finally {
      if (gen === leadsLoadGenRef.current) setLoading(false);
    }
  }, [addToast, aiMode, assignedFilter, branchFilter, followUpEnd, followUpStart, page, search, sortBy, sortOrder, sourceFilter, statusFilter]);

  const loadLeadDetail = useCallback(
    async (id: string) => {
      setDetailLoading(true);
      try {
        const data = await apiFetch<ApiLead>(`/leads/${id}`);
        setDetailLead(data);
      } catch (error) {
        addToast("error", error instanceof Error ? error.message : "Unable to load lead detail");
      } finally {
        setDetailLoading(false);
      }
    },
    [addToast],
  );

  const loadSyncStatus = useCallback(async () => {
    const data = await apiFetch<{ lastSyncAt: string | null; emailsMatched: number; emailsSkipped: number }>("/emails/sync-status");
    setSyncStatus(data);
  }, []);

  const openLeadDetailDrawer = useCallback(
    (leadId: string, syncDemoSelection = false) => {
      setDetailLeadId(leadId);
      loadLeadDetail(leadId).catch(() => undefined);
      if (syncDemoSelection) {
        window.dispatchEvent(new CustomEvent("crm-tour-lead-selected", { detail: leadId }));
        (window as unknown as Record<string, string>).__demoLeadId = leadId;
      }
    },
    [loadLeadDetail],
  );

  const openFirstLeadForTour = useCallback(() => {
    const firstLead = leads[0];
    if (!firstLead) return false;
    openLeadDetailDrawer(firstLead.id, true);
    return true;
  }, [leads, openLeadDetailDrawer]);

  useEffect(() => {
    loadUsers().catch(() => undefined);
    loadSyncStatus().catch(() => undefined);
  }, [loadSyncStatus, loadUsers]);

  useEffect(() => {
    if (aiMode && search.trim()) {
      const handle = window.setTimeout(() => {
        loadLeads().catch(() => undefined);
      }, 450);
      return () => window.clearTimeout(handle);
    }
    loadLeads().catch(() => undefined);
    return undefined;
  }, [aiMode, loadLeads, search]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setAiMode((prev) => !prev);
        window.setTimeout(() => searchRef.current?.focus(), 0);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const leadId = searchParams.get("leadId");
    if (leadId) {
      openLeadDetailDrawer(leadId);
    }
    const status = searchParams.get("status");
    if (status === "ALL" || (status && LEAD_STATUS_URL_SET.has(status))) {
      setStatusFilter(status);
    }
    if (searchParams.get("moreFilters") === "1" || searchParams.get("expandFilters") === "1") {
      setShowMoreFilters(true);
    }
  }, [openLeadDetailDrawer, searchParams]);

  useEffect(() => {
    if (!pendingTourOpenFirstLeadRef.current || loading) return;
    if (leads.length === 0) {
      pendingTourOpenFirstLeadRef.current = false;
      return;
    }
    pendingTourOpenFirstLeadRef.current = false;
    openFirstLeadForTour();
  }, [leads, loading, openFirstLeadForTour]);

  useEffect(() => {
    if (!headerActionsOpen && !detailActionsOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (headerActionsOpen && headerActionsRef.current && !headerActionsRef.current.contains(target)) {
        setHeaderActionsOpen(false);
      }
      if (detailActionsOpen && detailActionsRef.current && !detailActionsRef.current.contains(target)) {
        setDetailActionsOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setHeaderActionsOpen(false);
        setDetailActionsOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [headerActionsOpen, detailActionsOpen]);

  useEffect(() => {
    if (!detailLeadId) setDetailActionsOpen(false);
  }, [detailLeadId]);

  const openAddPanel = useCallback((): void => {
    if (readOnly) return;
    setEditingLead(null);
    setForm({
      ...emptyLeadForm(),
      assignedToId: currentUserRecord?.id ?? user?.id ?? users[0]?.id ?? "",
      branch: currentUserRecord?.branch ?? "",
    });
    setPanelOpen(true);
  }, [currentUserRecord?.branch, currentUserRecord?.id, readOnly, user?.id, users]);

  useEffect(() => {
    const focusSearch = () => searchRef.current?.focus();
    const openAdd = () => openAddPanel();
    const closeOverlays = () => {
      pendingTourOpenFirstLeadRef.current = false;
      setPanelOpen(false);
      setDetailLeadId(null);
    };
    const tourOpenFirstLead = () => {
      if (!openFirstLeadForTour() && loading) {
        pendingTourOpenFirstLeadRef.current = true;
      }
    };
    const demoOpenPrimaryLead = () => {
      const selectedLeadId = (window as unknown as Record<string, string | undefined>).__demoLeadId;
      if (selectedLeadId) {
        openLeadDetailDrawer(selectedLeadId, true);
        return;
      }
      if (!openFirstLeadForTour() && loading) {
        pendingTourOpenFirstLeadRef.current = true;
      }
    };
    const tourSetTab = (e: Event) => {
      const tab = (e as CustomEvent<string>).detail;
      if (tab === "activity" || tab === "contacts" || tab === "documents" || tab === "details") {
        setDetailTab(tab);
      }
    };
    const tourCloseDrawer = () => {
      pendingTourOpenFirstLeadRef.current = false;
      setDetailLeadId(null);
    };
    const demoClearSearch = () => {
      setSearch("");
      setStatusFilter("ALL");
    };
    window.addEventListener("crm-focus-search", focusSearch);
    window.addEventListener("crm-open-add-lead", openAdd);
    window.addEventListener("crm-close-overlays", closeOverlays);
    window.addEventListener("crm-tour-open-first-lead", tourOpenFirstLead);
    window.addEventListener("crm-demo-open-primary-lead", demoOpenPrimaryLead);
    window.addEventListener("crm-tour-set-detail-tab", tourSetTab);
    window.addEventListener("crm-tour-close-drawer", tourCloseDrawer);
    window.addEventListener("crm-demo-clear-search", demoClearSearch);
    return () => {
      window.removeEventListener("crm-focus-search", focusSearch);
      window.removeEventListener("crm-open-add-lead", openAdd);
      window.removeEventListener("crm-close-overlays", closeOverlays);
      window.removeEventListener("crm-tour-open-first-lead", tourOpenFirstLead);
      window.removeEventListener("crm-demo-open-primary-lead", demoOpenPrimaryLead);
      window.removeEventListener("crm-tour-set-detail-tab", tourSetTab);
      window.removeEventListener("crm-tour-close-drawer", tourCloseDrawer);
      window.removeEventListener("crm-demo-clear-search", demoClearSearch);
    };
  }, [loading, openAddPanel, openFirstLeadForTour]);

  const openEditPanel = (lead: ApiLead): void => {
    if (readOnly) return;
    setEditingLead(lead);
    setForm({
      firstName: lead.firstName,
      lastName: lead.lastName,
      company: lead.company ?? "",
      email: lead.email ?? "",
      phone: lead.phone ?? "",
      industryCode: lead.industryCode ?? "",
      addressLine1: lead.addressLine1 ?? "",
      city: lead.city ?? "",
      state: lead.state ?? "",
      postalCode: lead.postalCode ?? "",
      source: lead.source,
      status: lead.status,
      pipelineValue: lead.pipelineValue?.toString() ?? "",
      notes: lead.notes ?? "",
      nextFollowUp: lead.nextFollowUp ? lead.nextFollowUp.slice(0, 10) : "",
      branch: lead.branch ?? "",
      assignedToId: lead.assignedToId,
    });
    setPanelOpen(true);
  };

  const saveLead = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (readOnly) return;
    setSaving(true);
    try {
      const payload = {
        ...form,
        company: form.company || undefined,
        email: form.email || undefined,
        phone: form.phone || undefined,
        industryCode: form.industryCode || undefined,
        addressLine1: form.addressLine1 || undefined,
        city: form.city || undefined,
        state: form.state || undefined,
        postalCode: form.postalCode || undefined,
        notes: form.notes || undefined,
        nextFollowUp: form.nextFollowUp || undefined,
        branch: form.branch || undefined,
        pipelineValue: form.pipelineValue ? Number(form.pipelineValue) : undefined,
      };
      let savedLead: ApiLead;
      if (editingLead) {
        savedLead = await apiFetch<ApiLead>(`/leads/${editingLead.id}`, { method: "PUT", body: JSON.stringify(payload) });
        addToast("success", "Lead updated successfully");
      } else {
        savedLead = await apiFetch<ApiLead>("/leads", { method: "POST", body: JSON.stringify(payload) });
        addToast("success", "Lead created successfully");
      }
      setPanelOpen(false);
      await loadLeads();
      if (editingLead && detailLeadId === savedLead.id) {
        await loadLeadDetail(savedLead.id);
      } else if (!editingLead) {
        setDetailTab("activity");
        openLeadDetailDrawer(savedLead.id);
      }
    } catch (error) {
      addToast("error", error instanceof Error ? error.message : "Unable to save lead");
    } finally {
      setSaving(false);
    }
  };

  const archiveLead = async (lead: ApiLead): Promise<void> => {
    if (readOnly) return;
    try {
      await apiFetch<{ action: "archived"; lead: ApiLead }>(`/leads/${lead.id}`, { method: "DELETE" });
      addToast("success", `${lead.firstName} ${lead.lastName} moved to dormant`);
      if (detailLeadId === lead.id) setDetailLeadId(null);
      await loadLeads();
    } catch (error) {
      addToast("error", error instanceof Error ? error.message : "Unable to archive lead");
    }
  };

  const submitQuickActivity = async (): Promise<void> => {
    const targetLead = detailLead ?? editingLead;
    if (readOnly || !targetLead || !activitySubject.trim()) return;
    try {
      await apiFetch(`/leads/${targetLead.id}/activities`, {
        method: "POST",
        body: JSON.stringify({
          type: activityType,
          subject: activitySubject.trim(),
          description: activityDescription || undefined,
        }),
      });
      setActivitySubject("");
      setActivityDescription("");
      await loadLeadDetail(targetLead.id);
      addToast("success", "Activity logged");
    } catch (error) {
      addToast("error", error instanceof Error ? error.message : "Unable to log activity");
    }
  };

  const runEmailSyncNow = async (): Promise<void> => {
    if (readOnly) return;
    try {
      await apiFetch("/emails/manual-sync", { method: "POST" });
      await loadSyncStatus();
      if (detailLeadId) await loadLeadDetail(detailLeadId);
      addToast("success", "Outlook sync complete");
    } catch (error) {
      addToast("error", error instanceof Error ? error.message : "Unable to sync email activity");
    }
  };

  const submitContact = async (): Promise<void> => {
    if (readOnly || !detailLead) return;
    const payload = {
      firstName: contactForm.firstName,
      lastName: contactForm.lastName,
      email: contactForm.email || undefined,
      phone: contactForm.phone || undefined,
      title: contactForm.title || undefined,
      notes: contactForm.notes || undefined,
      isPrimary: contactForm.isPrimary,
      leadId: detailLead.id,
    };
    try {
      if (contactForm.id) {
        await apiFetch(`/contacts/${contactForm.id}`, { method: "PUT", body: JSON.stringify(payload) });
        addToast("success", "Contact updated");
      } else {
        await apiFetch("/contacts", { method: "POST", body: JSON.stringify(payload) });
        addToast("success", "Contact created");
      }
      setContactForm({ id: "", firstName: "", lastName: "", email: "", phone: "", title: "", notes: "", isPrimary: false });
      await loadLeadDetail(detailLead.id);
    } catch (error) {
      addToast("error", error instanceof Error ? error.message : "Unable to save contact");
    }
  };

  const uploadLeadDocument = async (): Promise<void> => {
    if (readOnly || !detailLead) return;
    const file = docFileRef.current?.files?.[0];
    if (!file) {
      addToast("error", "Choose a file to upload");
      return;
    }
    setDocUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("category", docCategory);
      await apiFetch<ApiLeadDocument>(`/leads/${detailLead.id}/documents`, { method: "POST", body: fd });
      if (docFileRef.current) docFileRef.current.value = "";
      await loadLeadDetail(detailLead.id);
      addToast("success", "Document uploaded");
    } catch (error) {
      addToast("error", error instanceof Error ? error.message : "Upload failed");
    } finally {
      setDocUploading(false);
    }
  };

  const downloadLeadDocument = async (doc: ApiLeadDocument): Promise<void> => {
    if (!detailLead) return;
    try {
      const res = await apiFetchBlob(`/leads/${detailLead.id}/documents/${doc.id}/download`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = doc.fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      addToast("error", error instanceof Error ? error.message : "Download failed");
    }
  };

  const deleteLeadDocument = async (doc: ApiLeadDocument): Promise<void> => {
    if (readOnly || !detailLead) return;
    if (!window.confirm(`Delete “${doc.fileName}”?`)) return;
    try {
      await apiFetch(`/leads/${detailLead.id}/documents/${doc.id}`, { method: "DELETE" });
      await loadLeadDetail(detailLead.id);
      addToast("success", "Document removed");
    } catch (error) {
      addToast("error", error instanceof Error ? error.message : "Unable to delete document");
    }
  };

  const toggleSort = (column: string): void => {
    if (sortBy === column) setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    else {
      setSortBy(column);
      setSortOrder("asc");
    }
  };

  const exportCsv = (): void => {
    const header = [
      "Name",
      "Company",
      "Industry Code",
      "Address",
      "City",
      "State",
      "ZIP",
      "Email",
      "Phone",
      "Status",
      "Pipeline Value",
      "Source",
      "Branch",
      "Assigned Rep",
      "Next Follow-Up",
      "Last Activity Date",
      "Created Date",
    ];
    const rows = leads.map((lead) => [
      `${lead.firstName} ${lead.lastName}`,
      lead.company ?? "",
      lead.industryCode ?? "",
      lead.addressLine1 ?? "",
      lead.city ?? "",
      lead.state ?? "",
      lead.postalCode ?? "",
      lead.email ?? "",
      lead.phone ?? "",
      formatLeadStatus(lead.status),
      lead.pipelineValue?.toString() ?? "",
      lead.source,
      lead.branch ?? "",
      lead.assignedTo?.displayName ?? "",
      lead.nextFollowUp ? new Date(lead.nextFollowUp).toISOString() : "",
      lead.activities?.[0]?.createdAt ? new Date(lead.activities[0].createdAt).toISOString() : "",
      new Date(lead.createdAt).toISOString(),
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map((value) => `"${String(value).replaceAll("\"", "\"\"")}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `deerwood-leads-export-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    setHeaderActionsOpen(false);
  };

  const activeFilterCount = [assignedFilter !== "ALL", branchFilter !== "ALL", sourceFilter !== "ALL", followUpStart, followUpEnd].filter(Boolean).length;

  return (
    <section className="space-y-4">
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Leads</h2>
          <p className="mt-1 text-sm text-slate-600">Review the relationship, capture the touchpoint, and set the next step before you move on.</p>
        </div>
        <div className="flex items-center gap-2">
          {!readOnly && (
            <button onClick={openAddPanel} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
              Add Lead
            </button>
          )}
          {(role === USER_ROLES.COMPLIANCE_READONLY || role === USER_ROLES.ADMIN || role === USER_ROLES.EXECUTIVE || !readOnly) && (
            <div ref={headerActionsRef} className="relative">
              <button
                type="button"
                aria-expanded={headerActionsOpen}
                aria-haspopup="menu"
                aria-label="More lead actions"
                data-demo="leads-export"
                onClick={() => setHeaderActionsOpen((open) => !open)}
                className="rounded-md border border-slate-300 p-2 text-slate-600 hover:bg-slate-50"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
              {headerActionsOpen && (
                <div role="menu" className="absolute right-0 top-full z-30 mt-1 min-w-[140px] rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                  {(role === USER_ROLES.COMPLIANCE_READONLY || role === USER_ROLES.ADMIN || role === USER_ROLES.EXECUTIVE) && (
                    <button type="button" role="menuitem" onClick={exportCsv} className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50">
                      Export CSV
                    </button>
                  )}
                  {!readOnly && (
                    <Link
                      to="/import/leads"
                      role="menuitem"
                      onClick={() => setHeaderActionsOpen(false)}
                      className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                    >
                      Import Excel
                    </Link>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              ref={searchRef}
              data-tour="leads-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={
                aiMode
                  ? "Ask in plain language, e.g. dormant referral leads assigned to John"
                  : "Search name, company, email, phone..."
              }
              className="w-full rounded-md border border-gray-300 px-3 py-2 pr-12 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button
              data-tour="leads-ai-toggle"
              onClick={() => setAiMode((prev) => !prev)}
              className={`absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-xs font-medium ${
                aiMode ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
              title="Toggle AI Search (Cmd/Ctrl+K)"
            >
              AI
            </button>
          </div>
          <select data-tour="leads-status-filter" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500">
            <option value="ALL">All statuses</option>
            {LEAD_STATUSES.map((status) => (
              <option key={status} value={status}>{formatLeadStatus(status)}</option>
            ))}
          </select>
          <button
            data-demo="leads-more-filters"
            onClick={() => setShowMoreFilters((prev) => !prev)}
            className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
              activeFilterCount > 0 ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-300 text-slate-600 hover:bg-slate-50"
            }`}
          >
            Filters{activeFilterCount > 0 && <span className="rounded-full bg-blue-600 px-1.5 text-[10px] text-white">{activeFilterCount}</span>}
            {showMoreFilters ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </div>

        {showMoreFilters && (
          <div className="mt-3 grid gap-3 border-t border-slate-100 pt-3 md:grid-cols-5">
            <select value={assignedFilter} onChange={(e) => setAssignedFilter(e.target.value)} className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500">
              <option value="ALL">Assigned Rep: All</option>
              {sortedUsers.map((user) => (
                <option key={user.id} value={user.id}>{user.displayName}</option>
              ))}
            </select>
            <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)} className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500">
              <option value="ALL">Branch: All</option>
              {BRANCHES.map((branch) => (
                <option key={branch} value={branch}>{branch}</option>
              ))}
            </select>
            <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500">
              <option value="ALL">Source: All</option>
              {LEAD_SOURCES.map((source) => (
                <option key={source} value={source}>{formatLeadSource(source)}</option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <input type="date" value={followUpStart} onChange={(e) => setFollowUpStart(e.target.value)} placeholder="Follow-up from" className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
              <input type="date" value={followUpEnd} onChange={(e) => setFollowUpEnd(e.target.value)} placeholder="Follow-up to" className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
            {activeFilterCount > 0 && (
              <button
                onClick={() => { setAssignedFilter("ALL"); setBranchFilter("ALL"); setSourceFilter("ALL"); setFollowUpStart(""); setFollowUpEnd(""); }}
                className="inline-flex items-center gap-1 rounded-md text-sm text-slate-500 hover:text-slate-700"
              >
                <X className="h-3.5 w-3.5" /> Clear filters
              </button>
            )}
          </div>
        )}
      </div>

      {aiExplanation && (
        <div className="flex items-center gap-2 rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-700">
          <span className="font-medium">AI:</span>
          <span>{aiExplanation}</span>
        </div>
      )}

      <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white md:block">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              {[
                ["name", "Name"],
                ["company", "Company"],
                ["industryCode", "Industry"],
                ["status", "Status"],
                ["pipelineValue", "Pipeline Value"],
                ["assignedTo", "Assigned Rep"],
                ["branch", "Branch"],
                ["nextFollowUp", "Next Follow-Up"],
                ["lastActivity", "Last Activity"],
              ].map(([key, label]) => {
                const sortable = key !== "lastActivity";
                const active = sortBy === key;
                return (
                  <th key={key} className="px-4 py-3 text-left font-semibold text-slate-700">
                    {sortable ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(key)}
                        className="inline-flex items-center gap-1 rounded-md px-1 py-0.5 hover:bg-slate-100"
                        title={`Sort by ${label}`}
                      >
                        {label}
                        {active ? (
                          sortOrder === "asc" ? (
                            <ArrowUp className="h-3.5 w-3.5 text-blue-600" aria-hidden />
                          ) : (
                            <ArrowDown className="h-3.5 w-3.5 text-blue-600" aria-hidden />
                          )
                        ) : (
                          <ArrowUpDown className="h-3.5 w-3.5 text-slate-400" aria-hidden />
                        )}
                      </button>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-slate-600" title="Sorted with lead list; use activity date on detail for full history">
                        {label}
                      </span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading
              ? Array.from({ length: 8 }).map((_, idx) => (
                  <tr key={idx}>
                    {Array.from({ length: 9 }).map((__, cellIdx) => (
                      <td key={cellIdx} className="px-4 py-4">
                        <div className="h-4 animate-pulse rounded bg-slate-200" />
                      </td>
                    ))}
                  </tr>
                ))
              : leads.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center">
                      <div className="flex flex-col items-center text-slate-400">
                        <Target className="h-8 w-8 mb-2" />
                        <p className="text-sm font-medium">No leads found</p>
                        <p className="text-xs mt-1">Try adjusting your filters or add a new lead.</p>
                      </div>
                    </td>
                  </tr>
                ) : leads.map((lead, leadIdx) => (
                  <tr key={lead.id} {...(leadIdx === 0 ? { "data-tour": "lead-first-row" } : {})} className="cursor-pointer transition-colors hover:bg-slate-50" onClick={() => { setDetailLeadId(lead.id); loadLeadDetail(lead.id).catch(() => undefined); }}>
                    <td className="px-4 py-3 font-medium text-slate-900">{lead.firstName} {lead.lastName}</td>
                    <td className="px-4 py-3 text-slate-600">{lead.company ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{lead.industryCode ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusClasses[lead.status]}`}>{formatLeadStatus(lead.status)}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{lead.pipelineValue ? currency.format(Number(lead.pipelineValue)) : "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{lead.assignedTo?.displayName ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{lead.branch ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{lead.nextFollowUp ? new Date(lead.nextFollowUp).toLocaleDateString() : "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{lead.activities?.[0]?.subject ?? "No activity logged"}</td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 md:hidden">
        {loading
          ? Array.from({ length: 4 }).map((_, idx) => <div key={idx} className="h-28 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />)
          : leads.length === 0 ? (
              <div className="flex flex-col items-center rounded-xl border border-slate-200 bg-white py-12 text-slate-400">
                <Target className="h-8 w-8 mb-2" />
                <p className="text-sm font-medium">No leads found</p>
                <p className="text-xs mt-1">Try adjusting your filters or add a new lead.</p>
              </div>
            )
          : leads.map((lead, leadIdx) => (
              <button
                key={lead.id}
                {...(leadIdx === 0 ? { "data-tour": "lead-first-row" } : {})}
                onClick={() => {
                  setDetailLeadId(lead.id);
                  loadLeadDetail(lead.id).catch(() => undefined);
                }}
                className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-slate-900">{lead.firstName} {lead.lastName}</p>
                  <span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusClasses[lead.status]}`}>{formatLeadStatus(lead.status)}</span>
                </div>
                <p className="mt-1 text-sm text-slate-600">{lead.company ?? "No company"}</p>
                {lead.industryCode && <p className="mt-0.5 text-xs text-slate-500">Industry {lead.industryCode}</p>}
                <p className="mt-1 text-sm text-slate-500">{lead.assignedTo?.displayName ?? "Unassigned"} • {lead.branch ?? "No branch"}</p>
              </button>
            ))}
      </div>

      <div className="flex items-center justify-between text-sm text-slate-600">
        <p>Total leads: {total}</p>
        <div className="flex items-center gap-2">
          <button disabled={page <= 1 || aiMode} onClick={() => setPage((p) => Math.max(1, p - 1))} className="rounded border border-slate-300 px-3 py-1 disabled:opacity-50">
            Prev
          </button>
          <span>
            Page {page} of {totalPages}
          </span>
          <button disabled={page >= totalPages || aiMode} onClick={() => setPage((p) => p + 1)} className="rounded border border-slate-300 px-3 py-1 disabled:opacity-50">
            Next
          </button>
        </div>
      </div>

      {panelOpen && (
        <div className="fixed inset-0 z-[80]">
          <div onClick={() => setPanelOpen(false)} className="absolute inset-0 bg-slate-900/40" />
          <aside className="absolute right-0 top-0 h-full w-full max-w-xl transform bg-white shadow-xl transition-transform duration-300">
            <form onSubmit={saveLead} className="flex h-full flex-col">
              <div className="border-b border-slate-200 px-6 py-4">
                <h3 className="text-lg font-semibold text-slate-900">{editingLead ? "Edit Lead" : "Add Lead"}</h3>
              </div>
              <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
                {[
                  ["First Name", "firstName"],
                  ["Last Name", "lastName"],
                  ["Company", "company"],
                  ["Email", "email"],
                  ["Phone", "phone"],
                ].map(([label, key]) => (
                  <label key={key} className="block text-sm font-medium text-gray-700">
                    {label}
                    <input
                      value={form[key as keyof LeadFormState] as string}
                      onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}
                      className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </label>
                ))}
                <label className="block text-sm font-medium text-gray-700">
                  Industry code (e.g. NAICS)
                  <input
                    value={form.industryCode}
                    onChange={(e) => setForm((prev) => ({ ...prev, industryCode: e.target.value }))}
                    placeholder="522110"
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </label>
                <label className="block text-sm font-medium text-gray-700">
                  Street address
                  <input
                    value={form.addressLine1}
                    onChange={(e) => setForm((prev) => ({ ...prev, addressLine1: e.target.value }))}
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </label>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <label className="block text-sm font-medium text-gray-700 md:col-span-2">
                    City
                    <input
                      value={form.city}
                      onChange={(e) => setForm((prev) => ({ ...prev, city: e.target.value }))}
                      className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </label>
                  <label className="block text-sm font-medium text-gray-700">
                    State
                    <input
                      value={form.state}
                      onChange={(e) => setForm((prev) => ({ ...prev, state: e.target.value }))}
                      placeholder="MN"
                      maxLength={2}
                      className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 uppercase focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </label>
                  <label className="block text-sm font-medium text-gray-700">
                    ZIP
                    <input
                      value={form.postalCode}
                      onChange={(e) => setForm((prev) => ({ ...prev, postalCode: e.target.value }))}
                      className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </label>
                </div>
                <label className="block text-sm font-medium text-gray-700">
                  Assigned Rep
                  <select value={form.assignedToId} onChange={(e) => setForm((prev) => ({ ...prev, assignedToId: e.target.value }))} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500">
                    {sortedUsers.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.displayName}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm font-medium text-gray-700">
                  Branch
                  <select value={form.branch} onChange={(e) => setForm((prev) => ({ ...prev, branch: e.target.value }))} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500">
                    <option value="">Select branch</option>
                    {BRANCHES.map((branch) => (
                      <option key={branch} value={branch}>
                        {branch}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-sm font-medium text-gray-700">
                    Status
                    <select value={form.status} onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value as LeadStatus }))} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500">
                      {LEAD_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {formatLeadStatus(status)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm font-medium text-gray-700">
                    Source
                    <select value={form.source} onChange={(e) => setForm((prev) => ({ ...prev, source: e.target.value as LeadSource }))} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500">
                      {LEAD_SOURCES.map((source) => (
                        <option key={source} value={source}>
                          {source}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="block text-sm font-medium text-gray-700">
                  Pipeline Value
                  <input type="number" step="0.01" value={form.pipelineValue} onChange={(e) => setForm((prev) => ({ ...prev, pipelineValue: e.target.value }))} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </label>
                <label className="block text-sm font-medium text-gray-700">
                  Next Follow-Up
                  <input type="date" value={form.nextFollowUp} onChange={(e) => setForm((prev) => ({ ...prev, nextFollowUp: e.target.value }))} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </label>
                <label className="block text-sm font-medium text-gray-700">
                  Notes
                  <textarea value={form.notes} onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))} rows={4} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </label>

                {editingLead && !readOnly && (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <h4 className="text-sm font-semibold text-slate-800">Log Activity</h4>
                    <div className="mt-2 grid gap-2">
                      <select value={activityType} onChange={(e) => setActivityType(e.target.value as ActivityType)} className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500">
                        {ACTIVITY_TYPES.map((type) => (
                          <option key={type} value={type}>
                            {type}
                          </option>
                        ))}
                      </select>
                      <input value={activitySubject} onChange={(e) => setActivitySubject(e.target.value)} placeholder="Subject" className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                      <textarea value={activityDescription} onChange={(e) => setActivityDescription(e.target.value)} rows={2} placeholder="Description" className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                      <button type="button" onClick={() => submitQuickActivity().catch(() => undefined)} className="rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800">
                        Add Activity
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-2 border-t border-slate-200 px-6 py-4">
                <button type="button" onClick={() => setPanelOpen(false)} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  Cancel
                </button>
                <button disabled={saving} type="submit" className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
            </form>
          </aside>
        </div>
      )}

      {detailLeadId && (
        <div className="fixed inset-0 z-[60]">
          <div data-demo="lead-drawer-close" onClick={() => setDetailLeadId(null)} className="absolute inset-0 bg-slate-900/40" />
          <aside data-demo="lead-drawer" className="absolute right-0 top-0 h-full w-full max-w-3xl transform bg-white shadow-xl transition-transform duration-300">
            {detailLoading || !detailLead ? (
              <div className="space-y-3 p-6">
                <div className="h-6 w-64 animate-pulse rounded bg-slate-200" />
                <div className="h-24 animate-pulse rounded bg-slate-100" />
              </div>
            ) : (
              <div className="flex h-full flex-col">
                <div data-demo="lead-drawer-header" className="border-b border-slate-200 px-6 py-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xl font-semibold text-slate-900">{detailLead.firstName} {detailLead.lastName}</h3>
                      <p className="text-sm text-slate-600">{detailLead.company ?? "No company"}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusClasses[detailLead.status]}`}>{formatLeadStatus(detailLead.status)}</span>
                      {!readOnly && (
                        <button data-demo="lead-edit" onClick={() => openEditPanel(detailLead)} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                          Edit
                        </button>
                      )}
                      <Link
                        data-tour="lead-prep-button"
                        to={`/prep?leadId=${detailLead.id}`}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-blue-700 bg-blue-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-800"
                      >
                        <Sparkles className="h-4 w-4" /> AI Prep
                      </Link>
                      {!readOnly && (
                        <div ref={detailActionsRef} className="relative">
                          <button
                            type="button"
                            aria-expanded={detailActionsOpen}
                            aria-haspopup="menu"
                            aria-label="More actions for this lead"
                            onClick={() => setDetailActionsOpen((open) => !open)}
                            className="rounded-md border border-slate-300 p-2 text-slate-500 hover:bg-slate-50"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                          {detailActionsOpen && (
                            <div role="menu" className="absolute right-0 top-full z-30 mt-1 min-w-[140px] rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                  setDetailActionsOpen(false);
                                  archiveLead(detailLead).catch(() => undefined);
                                }}
                                className="block w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                              >
                                Move to Dormant
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">
                    {detailLead.assignedTo?.displayName ?? "Unassigned"} • {detailLead.branch ?? "No branch"} •{" "}
                    {detailLead.pipelineValue ? currency.format(Number(detailLead.pipelineValue)) : "No pipeline value"}
                  </p>
                  <div data-demo="lead-workflow-links" className="mt-4 flex flex-wrap gap-2">
                    <Link to={`/contacts?leadId=${detailLead.id}`} className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                      Portfolio contacts
                    </Link>
                    <Link to={`/activities?leadId=${detailLead.id}`} className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                      Full activity
                    </Link>
                    <Link to={`/ticklers?leadId=${detailLead.id}`} className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                      Ticklers
                    </Link>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1 border-b border-slate-200 px-6">
                  {(
                    [
                      ["activity", "Activity"],
                      ["contacts", "Contacts"],
                      ["documents", "Documents"],
                      ["details", "Details"],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      data-tour={`lead-tab-${key}`}
                      onClick={() => setDetailTab(key)}
                      className={`relative px-4 py-3 text-sm font-medium transition-colors ${
                        detailTab === key
                          ? "text-blue-700 after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:rounded-full after:bg-blue-600"
                          : "text-slate-500 hover:text-slate-900"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="flex-1 overflow-y-auto p-6">
                  {detailTab === "activity" && (
                    <div className="space-y-3">
                      {!readOnly && (
                        <div data-demo="lead-activity-quick-log" className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                          <h4 className="text-sm font-semibold text-slate-900">Log the latest touchpoint</h4>
                          <p className="mt-1 text-xs text-slate-600">Capture the call, email, or meeting before moving to the next relationship.</p>
                          <div className="mt-3 grid gap-2">
                            <select value={activityType} onChange={(e) => setActivityType(e.target.value as ActivityType)} className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500">
                              {ACTIVITY_TYPES.map((type) => (
                                <option key={type} value={type}>
                                  {type}
                                </option>
                              ))}
                            </select>
                            <input value={activitySubject} onChange={(e) => setActivitySubject(e.target.value)} placeholder="Subject" className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                            <textarea value={activityDescription} onChange={(e) => setActivityDescription(e.target.value)} rows={2} placeholder="Notes" className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                            <button disabled={!activitySubject.trim()} type="button" onClick={() => submitQuickActivity().catch(() => undefined)} className="rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60">
                              Add Activity
                            </button>
                          </div>
                        </div>
                      )}
                      <div className="flex items-center justify-between">
                        <label className="inline-flex items-center gap-2 text-xs text-slate-600">
                          <input
                            type="checkbox"
                            checked={activityEmailOnly}
                            onChange={(event) => setActivityEmailOnly(event.target.checked)}
                          />
                          Email only
                        </label>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-slate-400">
                            {syncStatus?.lastSyncAt ? `Synced ${new Date(syncStatus.lastSyncAt).toLocaleDateString()}` : "Not synced"}
                          </span>
                          {!readOnly && (
                            <button
                              onClick={() => runEmailSyncNow().catch(() => undefined)}
                              className="rounded-md border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50"
                            >
                              Sync
                            </button>
                          )}
                        </div>
                      </div>
                      {(() => {
                        const acts =
                          detailLead.activities?.filter((activity) => (activityEmailOnly ? activity.type === "EMAIL" : true)) ?? [];
                        if (acts.length === 0) {
                          return (
                            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                              {activityEmailOnly && (detailLead.activities?.length ?? 0) > 0
                                ? "No email activities match this filter. Turn off “Email only” to see all touchpoints."
                                : "No activities logged yet. Use the quick log above to record the latest touchpoint."}
                            </div>
                          );
                        }
                        return acts.map((activity) => (
                          <div key={activity.id} className="rounded-lg border border-slate-200 p-3">
                            <div className="flex items-center justify-between">
                              <p className="flex items-center gap-1 text-sm font-semibold text-slate-900">
                                {activity.type === "EMAIL" && <Mail className="h-4 w-4 text-slate-500" />}
                                {activity.type} • {activity.subject}
                              </p>
                              <p className="text-xs text-slate-500">{new Date(activity.createdAt).toLocaleString()}</p>
                            </div>
                            <p className="mt-1 text-sm text-slate-600">{activity.description ?? "No description provided."}</p>
                            <p className="mt-1 text-xs text-slate-500">
                              Logged by {activity.user?.displayName ?? "Unknown user"}
                              {activity.autoLogged ? " • Auto-logged from Outlook" : ""}
                            </p>
                          </div>
                        ));
                      })()}
                    </div>
                  )}
                  {detailTab === "contacts" && (
                    <div className="space-y-4">
                      {!readOnly && (
                        <>
                          <div data-demo="lead-contacts-form" className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                            <h4 className="text-sm font-semibold text-slate-900">Relationship team</h4>
                            <p className="mt-1 text-xs text-slate-600">Track the decision-makers, operators, and supporters tied to this lead.</p>
                            <div className="mt-3 grid gap-2 md:grid-cols-2">
                              <input value={contactForm.firstName} onChange={(e) => setContactForm((prev) => ({ ...prev, firstName: e.target.value }))} placeholder="First Name" className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                              <input value={contactForm.lastName} onChange={(e) => setContactForm((prev) => ({ ...prev, lastName: e.target.value }))} placeholder="Last Name" className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                              <input value={contactForm.email} onChange={(e) => setContactForm((prev) => ({ ...prev, email: e.target.value }))} placeholder="Email" className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                              <input value={contactForm.phone} onChange={(e) => setContactForm((prev) => ({ ...prev, phone: e.target.value }))} placeholder="Phone" className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                              <input value={contactForm.title} onChange={(e) => setContactForm((prev) => ({ ...prev, title: e.target.value }))} placeholder="Title" className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                              <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                                <input type="checkbox" checked={contactForm.isPrimary} onChange={(e) => setContactForm((prev) => ({ ...prev, isPrimary: e.target.checked }))} />
                                Primary contact
                              </label>
                              <textarea value={contactForm.notes} onChange={(e) => setContactForm((prev) => ({ ...prev, notes: e.target.value }))} placeholder="Notes" rows={2} className="md:col-span-2 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                            </div>
                            <button disabled={!contactForm.firstName.trim() || !contactForm.lastName.trim()} onClick={() => submitContact().catch(() => undefined)} className="mt-3 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
                              {contactForm.id ? "Update Contact" : "Add Contact"}
                            </button>
                          </div>
                        </>
                      )}
                      <div className="space-y-2">
                        {detailLead.contacts?.map((contact: ApiContact) =>
                          readOnly ? (
                            <div key={contact.id} className="block w-full rounded-lg border border-slate-200 p-3 text-left">
                              <p className="text-sm font-semibold text-slate-900">
                                {contact.firstName} {contact.lastName}
                              </p>
                              <p className="text-xs text-slate-600">
                                {contact.title ?? "No title"} • {contact.email ?? "No email"}
                              </p>
                            </div>
                          ) : (
                            <button
                              key={contact.id}
                              onClick={() =>
                                setContactForm({
                                  id: contact.id,
                                  firstName: contact.firstName,
                                  lastName: contact.lastName,
                                  email: contact.email ?? "",
                                  phone: contact.phone ?? "",
                                  title: contact.title ?? "",
                                  notes: contact.notes ?? "",
                                  isPrimary: contact.isPrimary,
                                })
                              }
                              className="block w-full rounded-lg border border-slate-200 p-3 text-left hover:bg-slate-50"
                            >
                              <p className="text-sm font-semibold text-slate-900">
                                {contact.firstName} {contact.lastName}
                              </p>
                              <p className="text-xs text-slate-600">
                                {contact.title ?? "No title"} • {contact.email ?? "No email"}
                              </p>
                            </button>
                          ),
                        )}
                      </div>
                    </div>
                  )}
                  {detailTab === "documents" && (
                    <div className="space-y-4">
                      {!readOnly && (
                        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                          <h4 className="text-sm font-semibold text-slate-800">Upload</h4>
                          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
                            <label className="text-sm text-slate-600">
                              Category
                              <select
                                value={docCategory}
                                onChange={(e) => setDocCategory(e.target.value as LeadDocumentCategory)}
                                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:w-48"
                              >
                                {LEAD_DOCUMENT_CATEGORIES.map((c) => (
                                  <option key={c} value={c}>
                                    {LEAD_DOCUMENT_CATEGORY_LABELS[c]}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="text-sm text-slate-600">
                              File (PDF, Office, images, CSV — max ~15 MB)
                              <input
                                ref={docFileRef}
                                type="file"
                                accept=".pdf,.csv,.doc,.docx,.xls,.xlsx,image/*"
                                className="mt-1 block w-full text-sm text-slate-600 file:mr-2 file:rounded-md file:border-0 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700"
                              />
                            </label>
                            <button
                              type="button"
                              disabled={docUploading}
                              onClick={() => uploadLeadDocument().catch(() => undefined)}
                              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                            >
                              {docUploading ? "Uploading…" : "Upload"}
                            </button>
                          </div>
                        </div>
                      )}
                      <div className="space-y-2">
                        {detailLead.documents && detailLead.documents.length > 0 ? (
                          detailLead.documents.map((doc) => (
                            <div
                              key={doc.id}
                              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-3"
                            >
                              <div className="flex min-w-0 items-start gap-2">
                                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden />
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium text-slate-900">{doc.fileName}</p>
                                  <p className="text-xs text-slate-500">
                                    {LEAD_DOCUMENT_CATEGORY_LABELS[doc.category]} · {formatBytes(doc.sizeBytes)} ·{" "}
                                    {new Date(doc.createdAt).toLocaleString()}
                                    {doc.uploadedBy?.displayName ? ` · ${doc.uploadedBy.displayName}` : ""}
                                  </p>
                                </div>
                              </div>
                              <div className="flex shrink-0 gap-2">
                                <button
                                  type="button"
                                  onClick={() => downloadLeadDocument(doc).catch(() => undefined)}
                                  className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                                >
                                  Download
                                </button>
                                {!readOnly && (
                                  <button
                                    type="button"
                                    onClick={() => deleteLeadDocument(doc).catch(() => undefined)}
                                    className="rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100"
                                  >
                                    Delete
                                  </button>
                                )}
                              </div>
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-slate-600">No documents yet.</p>
                        )}
                      </div>
                    </div>
                  )}
                  {detailTab === "details" && (
                    <div className="space-y-3">
                      <p className="text-sm text-slate-700"><span className="font-semibold">Industry code:</span> {detailLead.industryCode ?? "—"}</p>
                      <p className="text-sm text-slate-700"><span className="font-semibold">Address:</span>{" "}
                        {[detailLead.addressLine1, [detailLead.city, detailLead.state].filter(Boolean).join(", "), detailLead.postalCode].filter(Boolean).join(" · ") || "—"}
                      </p>
                      <p className="text-sm text-slate-700"><span className="font-semibold">Email:</span> {detailLead.email ?? "—"}</p>
                      <p className="text-sm text-slate-700"><span className="font-semibold">Phone:</span> {detailLead.phone ?? "—"}</p>
                      <p className="text-sm text-slate-700"><span className="font-semibold">Source:</span> {detailLead.source}</p>
                      <p className="text-sm text-slate-700"><span className="font-semibold">Next Follow-Up:</span> {detailLead.nextFollowUp ? new Date(detailLead.nextFollowUp).toLocaleDateString() : "—"}</p>
                      <p className="text-sm text-slate-700"><span className="font-semibold">Notes:</span> {detailLead.notes ?? "—"}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </aside>
        </div>
      )}
    </section>
  );
}
