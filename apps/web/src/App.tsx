import { Suspense, lazy, useEffect, useState } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Layout } from "./components/Layout";
import { Login } from "./pages/Login";
const Dashboard = lazy(() => import("./pages/Dashboard").then((m) => ({ default: m.Dashboard })));
const Leads = lazy(() => import("./pages/Leads").then((m) => ({ default: m.Leads })));
const Contacts = lazy(() => import("./pages/Contacts").then((m) => ({ default: m.Contacts })));
const Activities = lazy(() => import("./pages/Activities").then((m) => ({ default: m.Activities })));
const Automations = lazy(() => import("./pages/Automations").then((m) => ({ default: m.Automations })));
const Settings = lazy(() => import("./pages/Settings").then((m) => ({ default: m.Settings })));
const ImportLeads = lazy(() => import("./pages/ImportLeads").then((m) => ({ default: m.ImportLeads })));
const Ticklers = lazy(() => import("./pages/Ticklers").then((m) => ({ default: m.Ticklers })));
const Reports = lazy(() => import("./pages/Reports").then((m) => ({ default: m.Reports })));
const PrepSheet = lazy(() => import("./pages/PrepSheet").then((m) => ({ default: m.PrepSheet })));
const ProspectMap = lazy(() => import("./pages/ProspectMap").then((m) => ({ default: m.ProspectMap })));

function App(): JSX.Element {
  const navigate = useNavigate();
  const [showHelp, setShowHelp] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab");
    if (tab) navigate(`/${tab}`);
  }, [navigate]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent("crm-focus-search"));
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "n") {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent("crm-open-add-lead"));
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "l") {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent("crm-open-log-activity"));
      }
      if (event.key === "Escape") {
        window.dispatchEvent(new CustomEvent("crm-close-overlays"));
        setShowHelp(false);
      }
      if (event.key === "?") {
        event.preventDefault();
        setShowHelp((prev) => !prev);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const onApiError = (event: Event) => {
      const message = (event as CustomEvent<string>).detail;
      setGlobalError(message);
      window.setTimeout(() => setGlobalError(null), 4000);
    };
    window.addEventListener("crm-api-error", onApiError);
    return () => window.removeEventListener("crm-api-error", onApiError);
  }, []);

  return (
    <>
      <Suspense fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-50">
          <div className="text-center">
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />
            <p className="mt-4 text-sm font-medium text-slate-500">Loading Deerwood Bank CRM...</p>
          </div>
        </div>
      }>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="leads" element={<Leads />} />
            <Route path="import/leads" element={<ImportLeads />} />
            <Route path="ticklers" element={<Ticklers />} />
            <Route path="reports" element={<Reports />} />
            <Route path="prep" element={<PrepSheet />} />
            <Route path="map" element={<ProspectMap />} />
            <Route path="contacts" element={<Contacts />} />
            <Route path="activities" element={<Activities />} />
            <Route path="automations" element={<Automations />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Routes>
      </Suspense>
      {showHelp && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-lg">
            <h3 className="text-lg font-semibold text-slate-900">Keyboard Shortcuts</h3>
            <ul className="mt-3 space-y-2 text-sm text-slate-700">
              <li>Ctrl/Cmd + K - Focus AI search</li>
              <li>Ctrl/Cmd + N - Open Add Lead</li>
              <li>Ctrl/Cmd + L - Open Log Activity</li>
              <li>Escape - Close overlays</li>
              <li>? - Toggle this help</li>
            </ul>
          </div>
        </div>
      )}
      {globalError && (
        <div className="fixed bottom-4 right-4 z-[90] rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow">
          {globalError}
        </div>
      )}
    </>
  );
}

export default App;
