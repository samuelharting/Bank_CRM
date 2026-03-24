import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { PublicClientApplication } from "@azure/msal-browser";
import { MsalProvider, useIsAuthenticated, useMsal } from "@azure/msal-react";
import { apiScopes, msalConfig } from "./msalConfig";
import { USER_ROLES } from "../types";
import type { AuthUser, UserRole } from "../types";
import { clearDevBypassUser, DEV_BYPASS_BEARER, isDevAuthBypassClientEnabled, readDevBypassUser } from "../lib/devAuth";
import { getTeamsAuthToken, getTeamsContext, isInTeams } from "../lib/teams";

const msalInstance = new PublicClientApplication(msalConfig);
const cachedAccount = msalInstance.getAllAccounts()[0];
if (cachedAccount) {
  msalInstance.setActiveAccount(cachedAccount);
}

interface AuthContextValue {
  isAuthenticated: boolean;
  user: AuthUser | null;
  role: UserRole;
  token: string | null;
  isTeamsMode: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  getAccessToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function InternalAuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const devBypassEnabled = isDevAuthBypassClientEnabled();
  const [devBypassUser, setDevBypassUser] = useState<AuthUser | null>(() => (devBypassEnabled ? readDevBypassUser() : null));

  useEffect(() => {
    if (!devBypassEnabled) return;
    const sync = (): void => {
      setDevBypassUser(readDevBypassUser());
    };
    window.addEventListener("dev-bypass-changed", sync);
    return () => window.removeEventListener("dev-bypass-changed", sync);
  }, [devBypassEnabled]);

  const { instance, accounts } = useMsal();
  const isAuthenticated = useIsAuthenticated();
  const account = accounts[0] ?? null;
  const teamsMode = isInTeams();
  const [teamsToken, setTeamsToken] = useState<string | null>(null);
  const [teamsAuthChecked, setTeamsAuthChecked] = useState(false);
  const [teamsAuthError, setTeamsAuthError] = useState<string | null>(null);
  const [teamsUserProfile, setTeamsUserProfile] = useState<{ id: string; displayName: string; email: string } | null>(null);

  useEffect(() => {
    if (!teamsMode) return;
    let active = true;
    const loadTeamsAuth = async (): Promise<void> => {
      try {
        const [token, context] = await Promise.all([getTeamsAuthToken(), getTeamsContext()]);
        if (!active) return;
        if (!token) {
          setTeamsToken(null);
          setTeamsAuthError("Unable to authenticate with Teams. Please try reopening the app or contact IT.");
        } else {
          setTeamsToken(token);
          setTeamsAuthError(null);
        }
        const user = (context as { user?: { id?: string; displayName?: string; userPrincipalName?: string } } | null)?.user;
        if (user) {
          setTeamsUserProfile({
            id: user.id ?? "teams-user",
            displayName: user.displayName ?? "Teams User",
            email: user.userPrincipalName ?? "",
          });
        } else {
          setTeamsUserProfile(null);
        }
      } catch {
        if (!active) return;
        setTeamsToken(null);
        setTeamsAuthError("Unable to authenticate with Teams. Please try reopening the app or contact IT.");
        setTeamsUserProfile(null);
      } finally {
        if (active) setTeamsAuthChecked(true);
      }
    };
    loadTeamsAuth().catch(() => undefined);
    return () => {
      active = false;
    };
  }, [teamsMode]);

  const login = async (): Promise<void> => {
    if (devBypassEnabled) return;
    if (teamsMode) return;
    const result = await instance.loginPopup();
    instance.setActiveAccount(result.account);
  };

  const logout = async (): Promise<void> => {
    if (devBypassEnabled && devBypassUser) {
      clearDevBypassUser();
      return;
    }
    if (teamsMode) return;
    await instance.logoutPopup();
  };

  const getAccessToken = async (): Promise<string | null> => {
    if (devBypassEnabled && devBypassUser) {
      return DEV_BYPASS_BEARER;
    }
    if (teamsMode) {
      if (teamsToken) return teamsToken;
      const token = await getTeamsAuthToken();
      if (token) {
        setTeamsToken(token);
        setTeamsAuthError(null);
      } else {
        setTeamsAuthError("Unable to authenticate with Teams. Please try reopening the app or contact IT.");
      }
      return token;
    }
    if (!account) return null;
    const result = await instance.acquireTokenSilent({
      ...apiScopes,
      account,
    });
    return result.accessToken;
  };

  const resolveRole = (): UserRole => {
    const claims = account?.idTokenClaims as { roles?: string[] } | undefined;
    const roleFromToken = claims?.roles?.find((role) => Object.values(USER_ROLES).includes(role as UserRole));
    return (roleFromToken as UserRole | undefined) ?? USER_ROLES.SALES_REP;
  };

  const resolvedRole = devBypassEnabled && devBypassUser ? devBypassUser.role : resolveRole();

  const value = useMemo<AuthContextValue>(
    () => ({
      isAuthenticated: devBypassEnabled && devBypassUser ? true : teamsMode ? Boolean(teamsToken) : isAuthenticated,
      user: devBypassEnabled && devBypassUser
        ? devBypassUser
        : account
          ? {
              id: account.homeAccountId,
              displayName: account.name ?? "Deerwood Bank User",
              email: account.username,
              role: resolvedRole,
            }
          : teamsMode
            ? teamsToken
              ? {
                  id: teamsUserProfile?.id ?? "teams-user",
                  displayName: teamsUserProfile?.displayName ?? "Teams User",
                  email: teamsUserProfile?.email ?? "",
                  role: resolvedRole,
                }
              : null
            : null,
      role: resolvedRole,
      token: devBypassEnabled && devBypassUser ? DEV_BYPASS_BEARER : teamsMode ? teamsToken : null,
      isTeamsMode: teamsMode,
      login,
      logout,
      getAccessToken,
    }),
    [account, devBypassEnabled, devBypassUser, isAuthenticated, resolvedRole, teamsMode, teamsToken, teamsUserProfile],
  );

  if (teamsMode && teamsAuthChecked && !teamsToken) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
        <div className="w-full max-w-md rounded-2xl border border-red-200 bg-white p-8 shadow-md">
          <h1 className="text-2xl font-semibold text-slate-900">Authentication Error</h1>
          <p className="mt-2 text-sm text-slate-700">
            {teamsAuthError ?? "Unable to authenticate with Teams. Please try reopening the app or contact IT."}
          </p>
        </div>
      </div>
    );
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  return (
    <MsalProvider instance={msalInstance}>
      <InternalAuthProvider>{children}</InternalAuthProvider>
    </MsalProvider>
  );
}

export const useAuthContext = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuthContext must be used within AuthProvider");
  return ctx;
};

export { msalInstance };
