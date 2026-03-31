import { msalInstance } from "../auth/AuthProvider";
import { apiScopes } from "../auth/msalConfig";
import { resolveApiBaseUrl } from "./apiBaseUrl";
import { clearDevBypassUser, DEV_BYPASS_BEARER, isDevAuthBypassClientEnabled, readDevBypassUser } from "./devAuth";
import { getTeamsAuthToken, isInTeams } from "./teams";

const apiUrl = resolveApiBaseUrl(import.meta.env.VITE_API_URL);

type AuthContext = { accessToken: string | null; devUserId: string | null };

const resolveAuth = async (): Promise<AuthContext> => {
  let accessToken: string | null = null;
  let devUserId: string | null = null;

  if (isDevAuthBypassClientEnabled()) {
    const devUser = readDevBypassUser();
    if (devUser) {
      accessToken = DEV_BYPASS_BEARER;
      devUserId = devUser.id;
    }
  }

  if (!accessToken) {
    if (isInTeams()) {
      accessToken = await getTeamsAuthToken();
      if (!accessToken) {
        throw new Error("Unable to authenticate with Teams. Please try reopening the app or contact IT.");
      }
    } else {
      const account = msalInstance.getActiveAccount() ?? msalInstance.getAllAccounts()[0] ?? null;
      if (!account) {
        throw new Error("No active Microsoft account found.");
      }
      const tokenResult = await msalInstance.acquireTokenSilent({
        ...apiScopes,
        account,
      });
      accessToken = tokenResult.accessToken;
    }
  }

  return { accessToken, devUserId };
};

const authHeaders = (auth: AuthContext, init?: RequestInit): Record<string, string> => {
  const isFormData = typeof FormData !== "undefined" && init?.body instanceof FormData;
  return {
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    ...(auth.accessToken ? { Authorization: `Bearer ${auth.accessToken}` } : {}),
    ...(auth.devUserId ? { "X-Dev-User-Id": auth.devUserId } : {}),
  };
};

const parseErrorMessage = async (response: Response): Promise<string> => {
  const payload = (await response.json().catch(() => null)) as { error?: string; details?: string } | null;
  return payload?.details ?? payload?.error ?? `API request failed with status ${response.status}`;
};

function handleUnauthorized(response: Response, message: string): void {
  // If the local seeded DB changed, the saved dev-bypass user can become invalid.
  if (
    response.status === 401 &&
    isDevAuthBypassClientEnabled() &&
    message.startsWith("Dev bypass:")
  ) {
    clearDevBypassUser();
    if (window.location.pathname !== "/login") {
      window.location.assign("/login");
    }
  }
}

export async function apiFetch<TResponse>(path: string, init?: RequestInit): Promise<TResponse> {
  const auth = await resolveAuth();
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: {
      ...authHeaders(auth, init),
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const message = await parseErrorMessage(response);
    handleUnauthorized(response, message);
    window.dispatchEvent(new CustomEvent("crm-api-error", { detail: message }));
    throw new Error(message);
  }

  return (await response.json()) as TResponse;
}

/** Authenticated fetch that returns the raw Response (e.g. file download). Caller must consume the body. */
export async function apiFetchBlob(path: string, init?: RequestInit): Promise<Response> {
  const auth = await resolveAuth();
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: {
      ...authHeaders(auth, init),
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const message = await parseErrorMessage(response);
    handleUnauthorized(response, message);
    window.dispatchEvent(new CustomEvent("crm-api-error", { detail: message }));
    throw new Error(message);
  }

  return response;
}
