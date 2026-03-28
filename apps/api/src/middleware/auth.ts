import { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import jwt, { JwtHeader, JwtPayload, SigningKeyCallback } from "jsonwebtoken";
import jwksClient from "jwks-rsa";
import { prisma } from "../db/client.js";
import { AuthenticatedUser } from "../types/index.js";

interface EntraClaims extends JwtPayload {
  oid?: string;
  preferred_username?: string;
  email?: string;
  name?: string;
}

const tenantId = process.env.AZURE_TENANT_ID ?? "your-tenant-id";
const azureClientId = process.env.AZURE_CLIENT_ID;

/** Must match `DEV_BYPASS_BEARER` in `apps/web/src/lib/devAuth.ts`. */
export const DEV_BYPASS_TOKEN = "__dev_bypass__";

/**
 * Dev auth bypass - enabled when DEV_AUTH_BYPASS=true.
 * For production safety, also requires DEV_AUTH_BYPASS_FORCE=true if NODE_ENV=production.
 */
export function isDevAuthBypassEnabled(): boolean {
  if (process.env.DEV_AUTH_BYPASS !== "true") return false;
  if (process.env.NODE_ENV === "production" && process.env.DEV_AUTH_BYPASS_FORCE !== "true") return false;
  return true;
}

const jwks = jwksClient({
  jwksUri: `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`,
  cache: true,
  cacheMaxEntries: 5,
  cacheMaxAge: 600000,
});

const getKey = (header: JwtHeader, callback: SigningKeyCallback): void => {
  if (!header.kid) {
    callback(new Error("Token header missing key id"));
    return;
  }

  jwks.getSigningKey(header.kid, (err, key) => {
    if (err || !key) {
      callback(err ?? new Error("Unable to get signing key"));
      return;
    }
    callback(null, key.getPublicKey());
  });
};

export const corsHeaders = (): Record<string, string> => ({
  "Access-Control-Allow-Origin": process.env.ALLOWED_ORIGIN ?? "http://localhost:5173",
  "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Dev-User-Id",
});

const unauthorized = (message: string): HttpResponseInit => ({
  status: 401,
  headers: corsHeaders(),
  jsonBody: { error: message },
});

export const handleCorsPreflight = (request: HttpRequest): HttpResponseInit | null => {
  if (request.method.toUpperCase() === "OPTIONS") {
    return { status: 204, headers: corsHeaders() };
  }
  return null;
};

export const requireAuth = async (
  request: HttpRequest,
  context: InvocationContext,
): Promise<{ user: AuthenticatedUser } | { response: HttpResponseInit }> => {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (isDevAuthBypassEnabled() && token === DEV_BYPASS_TOKEN) {
    const devUserId = request.headers.get("x-dev-user-id")?.trim();
    if (!devUserId) {
      return { response: unauthorized("Dev bypass: missing X-Dev-User-Id") };
    }
    const user = await prisma.user.findFirst({
      where: { id: devUserId, isActive: true },
    });
    if (!user) {
      return { response: unauthorized("Dev bypass: user not found") };
    }
    return {
      user: {
        id: user.id,
        entraId: user.entraId,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        branch: user.branch,
      },
    };
  }

  if (!token) {
    return { response: unauthorized("Missing bearer token") };
  }

  try {
    const decoded = await new Promise<EntraClaims>((resolve, reject) => {
      jwt.verify(
        token,
        getKey,
        {
          algorithms: ["RS256"],
          issuer: `https://login.microsoftonline.com/${tenantId}/v2.0`,
          audience: azureClientId ? [`api://${azureClientId}`, azureClientId] : undefined,
        },
        (error, payload) => {
          if (error) {
            reject(error);
            return;
          }
          resolve(payload as EntraClaims);
        },
      );
    });

    const entraId = decoded.oid;
    const email = decoded.preferred_username ?? decoded.email;
    if (!entraId || !email) {
      return { response: unauthorized("Token missing required claims") };
    }

    const user = await prisma.user.findFirst({
      where: {
        OR: [{ entraId }, { email }],
        isActive: true,
      },
    });

    if (!user) {
      return { response: unauthorized("User is not authorized for this CRM") };
    }

    return {
      user: {
        id: user.id,
        entraId: user.entraId,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        branch: user.branch,
      },
    };
  } catch (error) {
    context.error("Auth validation failed", error);
    return { response: unauthorized("Invalid or expired token") };
  }
};
