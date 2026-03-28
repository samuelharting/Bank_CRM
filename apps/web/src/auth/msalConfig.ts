const rawClientId = (import.meta.env.VITE_AZURE_CLIENT_ID as string | undefined)?.trim() ?? "";
const rawTenantId = (import.meta.env.VITE_AZURE_TENANT_ID as string | undefined)?.trim() ?? "";

/** MSAL validates clientId shape at construction; literal "placeholder" can throw. */
function isPlaceholderClientId(id: string): boolean {
  const t = id.toLowerCase();
  return !t || t === "placeholder" || t === "your_client_id" || id === "YOUR_CLIENT_ID";
}

function isPlaceholderTenantId(id: string): boolean {
  const t = id.toLowerCase();
  return !t || t === "placeholder" || t === "your_tenant_id" || id === "YOUR_TENANT_ID";
}

/** Valid GUID used only so PublicClientApplication can construct when env is not configured yet. */
const MSAL_STUB_CLIENT_ID = "00000000-0000-0000-0000-000000000001";

const resolvedClientId = isPlaceholderClientId(rawClientId) ? MSAL_STUB_CLIENT_ID : rawClientId;
const resolvedTenantSegment = isPlaceholderTenantId(rawTenantId) ? "common" : rawTenantId;

export const msalConfig = {
  auth: {
    clientId: resolvedClientId,
    authority: `https://login.microsoftonline.com/${resolvedTenantSegment}`,
    redirectUri: window.location.origin,
  },
  cache: {
    cacheLocation: "sessionStorage",
    storeAuthStateInCookie: false,
  },
};

export const loginRequest = {
  scopes: ["User.Read", "openid", "profile", "email"],
};

export const apiScopes = {
  scopes: [`api://${resolvedClientId}/access_as_user`],
};
