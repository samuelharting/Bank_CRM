/**
 * Adapter layer: Express request/response ↔ Azure Functions HttpRequest / HttpResponseInit.
 * Allows every existing handler to run unchanged inside an Express server.
 */

import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import type { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";

class AdaptedHeaders {
  private _map: Map<string, string>;

  constructor(raw: Record<string, string | string[] | undefined>) {
    this._map = new Map();
    for (const [k, v] of Object.entries(raw)) {
      if (v !== undefined) {
        this._map.set(k.toLowerCase(), Array.isArray(v) ? v.join(", ") : v);
      }
    }
  }

  get(name: string): string | null {
    return this._map.get(name.toLowerCase()) ?? null;
  }

  has(name: string): boolean {
    return this._map.has(name.toLowerCase());
  }

  entries(): IterableIterator<[string, string]> {
    return this._map.entries();
  }

  forEach(cb: (value: string, key: string) => void): void {
    this._map.forEach(cb);
  }
}

function buildQuery(query: Record<string, unknown>): URLSearchParams {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null) {
      sp.set(k, String(v));
    }
  }
  return sp;
}

export function toAzureRequest(req: Request): HttpRequest {
  const headers = new AdaptedHeaders(req.headers as Record<string, string | string[] | undefined>);
  const query = buildQuery(req.query);
  const protocol = req.protocol;
  const host = req.get("host") ?? "localhost";
  const fullUrl = `${protocol}://${host}${req.originalUrl}`;

  const adapted: HttpRequest = {
    method: req.method,
    url: fullUrl,
    headers: headers as unknown as HttpRequest["headers"],
    params: req.params ?? {},
    query,
    body: undefined,
    bodyUsed: false,

    async json() {
      return req.body;
    },

    async text() {
      return typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? "");
    },

    async formData() {
      if (!req.file && (!req.files || (Array.isArray(req.files) && req.files.length === 0))) {
        throw new Error("No multipart data");
      }

      const fd = new Map<string, unknown>();

      if (req.file) {
        const blob = new Blob([req.file.buffer as BlobPart], { type: req.file.mimetype }) as Blob & { name: string };
        Object.defineProperty(blob, "name", { value: req.file.originalname, writable: false });
        fd.set(req.file.fieldname, blob);
      }

      if (req.body && typeof req.body === "object") {
        for (const [k, v] of Object.entries(req.body)) {
          if (!fd.has(k)) fd.set(k, v);
        }
      }

      return {
        get(name: string) {
          return fd.get(name) ?? null;
        },
        has(name: string) {
          return fd.has(name);
        },
        entries() {
          return fd.entries();
        },
      } as unknown as FormData;
    },

    async arrayBuffer() {
      if (Buffer.isBuffer(req.body)) return req.body.buffer;
      return Buffer.from(JSON.stringify(req.body ?? "")).buffer;
    },

    async blob() {
      throw new Error("blob() not implemented in adapter");
    },

    clone() {
      return adapted;
    },
  } as unknown as HttpRequest;

  return adapted;
}

export function stubContext(functionName: string): InvocationContext {
  return {
    invocationId: randomUUID(),
    functionName,
    log: (...args: unknown[]) => console.log(`[${functionName}]`, ...args),
    error: (...args: unknown[]) => console.error(`[${functionName}]`, ...args),
    warn: (...args: unknown[]) => console.warn(`[${functionName}]`, ...args),
    trace: (...args: unknown[]) => console.debug(`[${functionName}]`, ...args),
    extraInputs: { get: () => undefined } as never,
    extraOutputs: { set: () => undefined } as never,
    options: {} as never,
    retryContext: undefined as never,
    traceContext: undefined as never,
    triggerMetadata: undefined as never,
  } as unknown as InvocationContext;
}

export function sendAzureResponse(res: Response, azRes: HttpResponseInit): void {
  const status = azRes.status ?? 200;

  if (azRes.headers) {
    const h = azRes.headers as Record<string, string>;
    for (const [k, v] of Object.entries(h)) {
      const kLower = k.toLowerCase();
      if (kLower.startsWith("access-control-")) continue;
      res.setHeader(k, v);
    }
  }

  if (azRes.jsonBody !== undefined) {
    res.status(status).json(azRes.jsonBody);
  } else if (azRes.body !== undefined) {
    if (Buffer.isBuffer(azRes.body)) {
      res.status(status).send(azRes.body);
    } else {
      res.status(status).send(azRes.body as string);
    }
  } else {
    res.status(status).end();
  }
}

type AzureHandler = (request: HttpRequest, context: InvocationContext) => Promise<HttpResponseInit>;

export function adaptHandler(handler: AzureHandler, name?: string) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const azReq = toAzureRequest(req);
      const ctx = stubContext(name ?? handler.name ?? "unknown");
      const azRes = await handler(azReq, ctx);
      sendAzureResponse(res, azRes);
    } catch (err) {
      console.error("Unhandled handler error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  };
}
