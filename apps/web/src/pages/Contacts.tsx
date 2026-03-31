import { Check, Phone } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { isReadOnlyRole } from "../lib/roles";
import type { ApiContact, ApiLead } from "../types";
import { useAuth } from "../auth/useAuth";
import { ToastContainer, type ToastMessage } from "../components/Toast";

interface ContactListResponse {
  results: Array<ApiContact & { lead: ApiLead }>;
  total: number;
  page: number;
  pageSize: number;
}

export function Contacts(): JSX.Element {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { role } = useAuth();
  const readOnly = isReadOnlyRole(role);
  const [contacts, setContacts] = useState<Array<ApiContact & { lead: ApiLead }>>([]);
  const [leads, setLeads] = useState<ApiLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loggingCall, setLoggingCall] = useState(false);
  const [search, setSearch] = useState("");
  const [branch, setBranch] = useState("ALL");
  const [leadStatus, setLeadStatus] = useState("ALL");
  const [sortBy, setSortBy] = useState("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [panelOpen, setPanelOpen] = useState(false);
  const [selectedContact, setSelectedContact] = useState<(ApiContact & { lead: ApiLead & { activities?: unknown[] } }) | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [form, setForm] = useState({
    id: "",
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    title: "",
    notes: "",
    isPrimary: false,
    leadId: "",
  });
  const leadIdFilter = searchParams.get("leadId");

  const branches = useMemo(() => Array.from(new Set(contacts.map((c) => c.lead.branch).filter(Boolean))) as string[], [contacts]);
  const visibleContacts = useMemo(
    () => (leadIdFilter ? contacts.filter((contact) => contact.leadId === leadIdFilter) : contacts),
    [contacts, leadIdFilter],
  );
  const activeLead = useMemo(
    () => (leadIdFilter ? leads.find((lead) => lead.id === leadIdFilter) ?? null : null),
    [leadIdFilter, leads],
  );

  const addToast = useCallback((type: ToastMessage["type"], message: string) => {
    setToasts((prev) => [...prev, { id: Date.now() + Math.random(), type, message }]);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const load = async (): Promise<void> => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: "1",
        pageSize: "50",
        search,
        branch,
        leadStatus,
        sortBy,
        sortOrder,
      });
      const [contactData, leadData] = await Promise.all([
        apiFetch<ContactListResponse>(`/contacts?${params.toString()}`),
        apiFetch<{ results: ApiLead[] }>("/leads?page=1&pageSize=200"),
      ]);
      setContacts(contactData.results);
      setLeads(leadData.results);
    } catch (error) {
      addToast("error", error instanceof Error ? error.message : "Unable to load contacts");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      load().catch(() => setLoading(false));
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [branch, leadStatus, search, sortBy, sortOrder]);

  useEffect(() => {
    const openFirstContact = () => {
      if (contacts[0]) {
        openDetail(contacts[0].id).catch(() => undefined);
      }
    };
    const closeContactDetail = () => {
      setDetailOpen(false);
      setSelectedContact(null);
    };
    window.addEventListener("crm-demo-open-first-contact", openFirstContact);
    window.addEventListener("crm-demo-close-contact-detail", closeContactDetail);
    return () => {
      window.removeEventListener("crm-demo-open-first-contact", openFirstContact);
      window.removeEventListener("crm-demo-close-contact-detail", closeContactDetail);
    };
  }, [contacts]);

  const openAdd = (): void => {
    if (readOnly) return;
    setForm({
      id: "",
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      title: "",
      notes: "",
      isPrimary: false,
      leadId: activeLead?.id ?? leads[0]?.id ?? "",
    });
    setPanelOpen(true);
  };

  const openEdit = (contact: ApiContact & { lead: ApiLead }): void => {
    if (readOnly) return;
    setForm({
      id: contact.id,
      firstName: contact.firstName,
      lastName: contact.lastName,
      email: contact.email ?? "",
      phone: contact.phone ?? "",
      title: contact.title ?? "",
      notes: contact.notes ?? "",
      isPrimary: contact.isPrimary,
      leadId: contact.leadId,
    });
    setPanelOpen(true);
  };

  const openDetail = async (id: string): Promise<void> => {
    try {
      const detail = await apiFetch<ApiContact & { lead: ApiLead & { activities?: unknown[] } }>(`/contacts/${id}`);
      setSelectedContact(detail);
      setDetailOpen(true);
    } catch (error) {
      addToast("error", error instanceof Error ? error.message : "Unable to open contact");
    }
  };

  const save = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (readOnly) return;
    if (!form.leadId) {
      addToast("error", "Choose a linked lead before saving the contact.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email || undefined,
        phone: form.phone || undefined,
        title: form.title || undefined,
        notes: form.notes || undefined,
        isPrimary: form.isPrimary,
        leadId: form.leadId,
      };
      if (form.id) {
        await apiFetch(`/contacts/${form.id}`, { method: "PUT", body: JSON.stringify(payload) });
        addToast("success", "Contact updated");
      } else {
        await apiFetch("/contacts", { method: "POST", body: JSON.stringify(payload) });
        addToast("success", "Contact created");
      }
      setPanelOpen(false);
      await load();
      if (detailOpen && selectedContact?.id === form.id) {
        await openDetail(form.id);
      }
    } catch (error) {
      addToast("error", error instanceof Error ? error.message : "Unable to save contact");
    } finally {
      setSaving(false);
    }
  };

  const logCall = async (): Promise<void> => {
    if (!selectedContact?.phone || readOnly) return;
    setLoggingCall(true);
    try {
      await apiFetch(`/leads/${selectedContact.leadId}/activities`, {
        method: "POST",
        body: JSON.stringify({ type: "CALL", subject: `Called ${selectedContact.firstName} ${selectedContact.lastName}` }),
      });
      await openDetail(selectedContact.id);
      addToast("success", "Call activity logged");
    } catch (error) {
      addToast("error", error instanceof Error ? error.message : "Unable to log call activity");
    } finally {
      setLoggingCall(false);
    }
  };

  return (
    <section data-tour="contacts-overview" className="space-y-4">
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Contacts</h2>
          <p className="mt-1 text-sm text-slate-600">See everyone tied to your leads and jump back into the relationship record in one click.</p>
        </div>
        {!readOnly && (
          <button onClick={openAdd} className="min-h-11 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
            Add Contact
          </button>
        )}
      </div>

      {activeLead && (
        <div data-demo="contacts-lead-context" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-blue-900">
              Showing contacts for {activeLead.firstName} {activeLead.lastName}
            </p>
            <p className="text-xs text-blue-700">{activeLead.company ?? "No company on file"}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to={`/leads?leadId=${activeLead.id}`} className="rounded-md border border-blue-200 bg-white px-3 py-2 text-sm text-blue-700 hover:bg-blue-100">
              Open lead
            </Link>
            <Link to="/contacts" className="rounded-md border border-blue-200 bg-white px-3 py-2 text-sm text-blue-700 hover:bg-blue-100">
              Clear filter
            </Link>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="grid gap-3 md:grid-cols-4">
          <input data-demo="contacts-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email, phone, company" className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 md:col-span-2" />
          <select data-demo="contacts-filter" value={branch} onChange={(e) => setBranch(e.target.value)} className="rounded-md border border-gray-300 px-3 py-2 text-sm">
            <option value="ALL">All branches</option>
            {branches.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
          <select value={leadStatus} onChange={(e) => setLeadStatus(e.target.value)} className="rounded-md border border-gray-300 px-3 py-2 text-sm">
            <option value="ALL">All lead statuses</option>
            <option value="PROSPECT">PROSPECT</option>
            <option value="CONTACTED">CONTACTED</option>
            <option value="QUALIFIED">QUALIFIED</option>
            <option value="PROPOSAL">PROPOSAL</option>
            <option value="WON">WON</option>
            <option value="LOST">LOST</option>
            <option value="DORMANT">DORMANT</option>
          </select>
        </div>
      </div>

      <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white md:block">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3"><button onClick={() => { setSortBy("name"); setSortOrder((v) => (v === "asc" ? "desc" : "asc")); }}>Name</button></th>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3"><button onClick={() => { setSortBy("company"); setSortOrder((v) => (v === "asc" ? "desc" : "asc")); }}>Company</button></th>
              <th className="px-4 py-3">Lead Status</th>
              <th className="px-4 py-3">Primary</th>
              <th className="px-4 py-3">Branch</th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 7 }).map((_, idx) => (
                  <tr key={idx}>
                    <td className="px-4 py-4" colSpan={8}>
                      <div className="h-4 animate-pulse rounded bg-slate-200" />
                    </td>
                  </tr>
                ))
              : visibleContacts.map((contact) => (
                  <tr key={contact.id} className="cursor-pointer border-t border-slate-100 hover:bg-gray-50" onClick={() => openDetail(contact.id).catch(() => undefined)}>
                    <td className="px-4 py-3 font-medium text-slate-900">{contact.firstName} {contact.lastName}</td>
                    <td className="px-4 py-3 text-slate-600">{contact.title ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{contact.email ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{contact.phone ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{contact.lead.company ?? "—"}</td>
                    <td className="px-4 py-3"><span className="rounded-full bg-slate-100 px-2 py-1 text-xs">{contact.lead.status}</span></td>
                    <td className="px-4 py-3">{contact.isPrimary ? <Check className="h-4 w-4 text-green-600" /> : "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{contact.lead.branch ?? "—"}</td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-2 md:hidden">
        {visibleContacts.map((contact) => (
          <button key={contact.id} onClick={() => openDetail(contact.id).catch(() => undefined)} className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left">
            <p className="font-semibold text-slate-900">{contact.firstName} {contact.lastName}</p>
            <p className="text-sm text-slate-600">{contact.title ?? "No title"} • {contact.lead.company ?? "No company"}</p>
          </button>
        ))}
      </div>

      {!loading && visibleContacts.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600">
          {activeLead
            ? "No contacts are linked to this lead yet. Add the key decision-makers and stakeholders here."
            : "No contacts yet - add your first contact to start tracking relationship stakeholders."}
        </div>
      )}

      {panelOpen && (
        <div className="fixed inset-0 z-[80]">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setPanelOpen(false)} />
          <aside className="absolute right-0 top-0 h-full w-full max-w-xl bg-white shadow-xl">
            <form onSubmit={save} className="flex h-full flex-col">
              <div className="border-b border-slate-200 px-6 py-4">
                <h3 className="text-lg font-semibold text-slate-900">{form.id ? "Edit Contact" : "Add Contact"}</h3>
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto px-6 py-4">
                <input required value={form.firstName} onChange={(e) => setForm((p) => ({ ...p, firstName: e.target.value }))} placeholder="First name" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
                <input required value={form.lastName} onChange={(e) => setForm((p) => ({ ...p, lastName: e.target.value }))} placeholder="Last name" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
                <input value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} placeholder="Email" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
                <input value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} placeholder="Phone" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
                <input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} placeholder="Title" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
                <textarea value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} placeholder="Notes" rows={4} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
                <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={form.isPrimary} onChange={(e) => setForm((p) => ({ ...p, isPrimary: e.target.checked }))} />
                  Primary contact
                </label>
                <select required value={form.leadId} onChange={(e) => setForm((p) => ({ ...p, leadId: e.target.value }))} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm">
                  <option value="">{loading ? "Loading leads..." : "Select linked lead"}</option>
                  {leads.map((lead) => (
                    <option key={lead.id} value={lead.id}>
                      {lead.firstName} {lead.lastName} - {lead.company ?? "No company"}
                    </option>
                  ))}
                </select>
                {!loading && leads.length === 0 && (
                  <p className="text-xs text-amber-700">No leads are available yet. Create a lead first, then add contacts to it.</p>
                )}
              </div>
              <div className="flex justify-end gap-2 border-t border-slate-200 px-6 py-4">
                <button type="button" onClick={() => setPanelOpen(false)} className="min-h-11 rounded-md border border-slate-300 px-4 py-2 text-sm">
                  Cancel
                </button>
                <button disabled={saving || !form.leadId} type="submit" className="min-h-11 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
            </form>
          </aside>
        </div>
      )}

      {detailOpen && selectedContact && (
        <div className="fixed inset-0 z-[60]">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setDetailOpen(false)} />
          <aside data-demo="contacts-detail" className="absolute right-0 top-0 h-full w-full max-w-2xl bg-white shadow-xl">
            <div className="flex h-full flex-col">
              <div className="border-b border-slate-200 px-6 py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-semibold text-slate-900">{selectedContact.firstName} {selectedContact.lastName}</h3>
                    <p className="text-sm text-slate-600">{selectedContact.title ?? "No title"}</p>
                  </div>
                  {!readOnly && (
                    <button className="rounded-md border border-slate-300 px-3 py-2 text-sm" onClick={() => openEdit(selectedContact)}>
                      Edit Contact
                    </button>
                  )}
                </div>
              </div>
              <div className="flex-1 space-y-4 overflow-y-auto p-6">
                <div className="rounded-lg border border-slate-200 p-4">
                  <p className="text-sm text-slate-700">{selectedContact.email ?? "No email"} • {selectedContact.phone ?? "No phone"}</p>
                  <div className="mt-3 flex gap-2">
                    {!readOnly && (
                      <button
                        disabled={!selectedContact.phone || loggingCall}
                        onClick={() => logCall().catch(() => undefined)}
                        className="inline-flex min-h-11 items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <Phone className="h-4 w-4" /> {loggingCall ? "Logging..." : "Call"}
                      </button>
                    )}
                    {selectedContact.email && (
                      <a href={`mailto:${selectedContact.email}`} className="inline-flex min-h-11 items-center rounded-md border border-slate-300 px-3 py-2 text-sm">
                        Email
                      </a>
                    )}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 p-4">
                  <p className="text-sm font-semibold text-slate-900">Linked Lead</p>
                  <button data-demo="contacts-linked-lead" onClick={() => navigate(`/leads?leadId=${selectedContact.leadId}`)} className="mt-2 text-sm text-blue-600 hover:underline">
                    {selectedContact.lead.firstName} {selectedContact.lead.lastName} - {selectedContact.lead.company ?? "No company"}
                  </button>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link to={`/activities?leadId=${selectedContact.leadId}`} className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                      View activity
                    </Link>
                    <Link to={`/ticklers?leadId=${selectedContact.leadId}`} className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                      View ticklers
                    </Link>
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 p-4">
                  <p className="text-sm font-semibold text-slate-900">Lead Activity Feed</p>
                  <div className="mt-2 space-y-2">
                    {(selectedContact.lead.activities ?? []).slice(0, 10).map((activity: { id: string; subject: string; createdAt: string }) => (
                      <div key={activity.id} className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
                        <p className="font-medium">{activity.subject}</p>
                        <p className="text-xs text-slate-500">{new Date(activity.createdAt).toLocaleString()}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}
