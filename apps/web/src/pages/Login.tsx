import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { isDevAuthBypassClientEnabled, writeDevBypassUser } from "../lib/devAuth";
import type { AuthUser, UserRole } from "../types";

const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:7071/api";

interface DevUserRow {
  id: string;
  displayName: string;
  email: string;
  branch: string | null;
  role: UserRole;
}

export function Login(): JSX.Element {
  const { isAuthenticated, isTeamsMode, login } = useAuth();
  const navigate = useNavigate();
  const devPicker = isDevAuthBypassClientEnabled();
  const [devUsers, setDevUsers] = useState<DevUserRow[]>([]);
  const [devError, setDevError] = useState<string | null>(null);
  const [devLoading, setDevLoading] = useState(devPicker);

  useEffect(() => {
    if (!devPicker) return;
    const load = async (): Promise<void> => {
      setDevLoading(true);
      setDevError(null);
      try {
        const res = await fetch(`${apiUrl}/auth/dev-users`);
        if (!res.ok) {
          setDevError(
            res.status === 404
              ? "Dev login is disabled on the API. Set DEV_AUTH_BYPASS=true for the Functions host (non-production) and restart."
              : `Could not load demo users (${res.status}).`,
          );
          setDevUsers([]);
          return;
        }
        const data = (await res.json()) as { users: DevUserRow[] };
        setDevUsers(data.users);
      } catch {
        setDevError("Could not reach the API. Is it running?");
        setDevUsers([]);
      } finally {
        setDevLoading(false);
      }
    };
    load().catch(() => undefined);
  }, [devPicker]);

  if (isAuthenticated || isTeamsMode) return <Navigate to="/dashboard" replace />;

  if (devPicker) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-md">
          <h1 className="text-2xl font-semibold text-slate-900">Deerwood Bank CRM</h1>
          <p className="mt-2 text-sm text-slate-600">Local development — choose a seeded demo user (no Microsoft sign-in).</p>
          {devLoading && <p className="mt-4 text-sm text-slate-500">Loading users…</p>}
          {devError && (
            <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{devError}</p>
          )}
          {!devLoading && !devError && devUsers.length > 0 && (
            <ul className="mt-4 max-h-80 space-y-2 overflow-y-auto">
              {devUsers.map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    onClick={() => {
                      const authUser: AuthUser = {
                        id: u.id,
                        displayName: u.displayName,
                        email: u.email,
                        role: u.role,
                      };
                      writeDevBypassUser(authUser);
                      navigate("/dashboard", { replace: true });
                    }}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-left text-sm hover:border-blue-400 hover:bg-blue-50"
                  >
                    <span className="font-medium text-slate-900">{u.displayName}</span>
                    <span className="block text-xs text-slate-500">
                      {u.email} · {u.role}
                      {u.branch ? ` · ${u.branch}` : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-6 text-xs text-slate-500">
            Production uses Microsoft Entra ID. Disable VITE_DEV_AUTH_BYPASS for real sign-in.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-md">
        <h1 className="text-2xl font-semibold text-slate-900">Deerwood Bank CRM</h1>
        <p className="mt-2 text-sm text-slate-600">
          Sign in with your Deerwood Bank Microsoft account to access leads, contacts, and sales activity.
        </p>
        <button
          onClick={() => login()}
          className="mt-6 w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Sign in with Microsoft
        </button>
      </div>
    </div>
  );
}
