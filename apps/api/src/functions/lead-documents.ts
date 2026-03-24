import { randomUUID } from "node:crypto";
import path from "node:path";
import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { LeadDocumentCategory } from "@prisma/client";
import { prisma } from "../db/client.js";
import { corsHeaders, handleCorsPreflight, requireAuth } from "../middleware/auth.js";
import { isReadOnlyRole, leadScopeWhere } from "../middleware/scope.js";
import { deleteObject, getMaxUploadBytes, putObject, readObjectBuffer } from "../services/storage.js";
import { AuthenticatedUser } from "../types/index.js";

const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "text/csv",
]);

const sanitizeFileName = (name: string): string => {
  const base = path.basename(name).replace(/[^\w.\- ()]+/g, "_");
  return base.slice(0, 200) || "upload";
};

const parseCategory = (value: unknown): LeadDocumentCategory => {
  const s = String(value ?? "").trim().toUpperCase();
  if (s === "TAX_RETURN" || s === "FINANCIAL" || s === "OTHER") {
    return s as LeadDocumentCategory;
  }
  return LeadDocumentCategory.OTHER;
};

const assertLeadAccess = async (user: AuthenticatedUser, leadId: string): Promise<boolean> =>
  (await prisma.lead.count({ where: { AND: [{ id: leadId }, leadScopeWhere(user)] } })) > 0;

export async function leadDocumentsCollection(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const preflight = handleCorsPreflight(request);
  if (preflight) return preflight;

  const auth = await requireAuth(request, context);
  if ("response" in auth) return auth.response;

  const leadId = request.params.leadId;
  if (!leadId) return { status: 400, headers: corsHeaders(), jsonBody: { error: "Lead id required" } };

  const method = request.method.toUpperCase();

  if (method === "GET") {
    const ok = await assertLeadAccess(auth.user, leadId);
    if (!ok) return { status: 403, headers: corsHeaders(), jsonBody: { error: "Access denied" } };
    const docs = await prisma.leadDocument.findMany({
      where: { leadId },
      include: { uploadedBy: true },
      orderBy: { createdAt: "desc" },
    });
    return { status: 200, headers: corsHeaders(), jsonBody: docs };
  }

  if (method === "POST") {
    if (isReadOnlyRole(auth.user.role)) {
      return { status: 403, headers: corsHeaders(), jsonBody: { error: "Role is read-only" } };
    }
    const ok = await assertLeadAccess(auth.user, leadId);
    if (!ok) return { status: 403, headers: corsHeaders(), jsonBody: { error: "Access denied" } };

    const formData = await request.formData();
    const fileEntry = formData.get("file");

    if (!fileEntry || typeof fileEntry === "string") {
      return { status: 400, headers: corsHeaders(), jsonBody: { error: 'Multipart field "file" is required' } };
    }

    const blob = fileEntry as Blob;
    const buffer = Buffer.from(await blob.arrayBuffer());
    const maxBytes = getMaxUploadBytes();
    if (buffer.length > maxBytes) {
      return { status: 413, headers: corsHeaders(), jsonBody: { error: `File too large (max ${maxBytes} bytes)` } };
    }
    if (buffer.length === 0) {
      return { status: 400, headers: corsHeaders(), jsonBody: { error: "Empty file" } };
    }

    const contentType = (blob as File).type || "application/octet-stream";
    if (!ALLOWED_MIME.has(contentType)) {
      return { status: 400, headers: corsHeaders(), jsonBody: { error: `Unsupported file type: ${contentType}` } };
    }

    const category = parseCategory(formData.get("category"));
    const rawName = (blob as File).name || "document";
    const fileName = sanitizeFileName(rawName);
    const blobKey = `leads/${leadId}/${randomUUID()}-${fileName}`;

    await putObject(blobKey, buffer, contentType);

    const doc = await prisma.leadDocument.create({
      data: {
        leadId,
        category,
        fileName,
        contentType,
        sizeBytes: buffer.length,
        blobPath: blobKey,
        uploadedById: auth.user.id,
      },
      include: { uploadedBy: true },
    });

    return { status: 201, headers: corsHeaders(), jsonBody: doc };
  }

  return { status: 405, headers: corsHeaders(), jsonBody: { error: "Method not allowed" } };
}

export async function leadDocumentById(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const preflight = handleCorsPreflight(request);
  if (preflight) return preflight;

  const auth = await requireAuth(request, context);
  if ("response" in auth) return auth.response;
  if (isReadOnlyRole(auth.user.role)) {
    return { status: 403, headers: corsHeaders(), jsonBody: { error: "Role is read-only" } };
  }

  const leadId = request.params.leadId;
  const documentId = request.params.documentId;
  if (!leadId || !documentId) {
    return { status: 400, headers: corsHeaders(), jsonBody: { error: "Lead and document id required" } };
  }

  if (request.method.toUpperCase() !== "DELETE") {
    return { status: 405, headers: corsHeaders(), jsonBody: { error: "Method not allowed" } };
  }

  const doc = await prisma.leadDocument.findFirst({
    where: {
      id: documentId,
      leadId,
      lead: leadScopeWhere(auth.user),
    },
  });

  if (!doc) return { status: 404, headers: corsHeaders(), jsonBody: { error: "Document not found" } };

  await deleteObject(doc.blobPath);
  await prisma.leadDocument.delete({ where: { id: documentId } });

  return { status: 200, headers: corsHeaders(), jsonBody: { ok: true } };
}

export async function leadDocumentDownload(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const preflight = handleCorsPreflight(request);
  if (preflight) return preflight;

  const auth = await requireAuth(request, context);
  if ("response" in auth) return auth.response;

  const leadId = request.params.leadId;
  const documentId = request.params.documentId;
  if (!leadId || !documentId) {
    return { status: 400, headers: corsHeaders(), jsonBody: { error: "Lead and document id required" } };
  }

  const doc = await prisma.leadDocument.findFirst({
    where: {
      id: documentId,
      leadId,
      lead: leadScopeWhere(auth.user),
    },
  });

  if (!doc) return { status: 404, headers: corsHeaders(), jsonBody: { error: "Document not found" } };

  try {
    const buffer = await readObjectBuffer(doc.blobPath);
    return {
      status: 200,
      headers: {
        ...corsHeaders(),
        "Content-Type": doc.contentType,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(doc.fileName)}`,
      },
      body: buffer,
    };
  } catch (error) {
    context.error("Document download failed", error);
    return { status: 500, headers: corsHeaders(), jsonBody: { error: "Failed to read file" } };
  }
}

app.http("leadDocumentsCollection", {
  methods: ["GET", "POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "leads/{leadId}/documents",
  handler: leadDocumentsCollection,
});

app.http("leadDocumentById", {
  methods: ["DELETE", "OPTIONS"],
  authLevel: "anonymous",
  route: "leads/{leadId}/documents/{documentId}",
  handler: leadDocumentById,
});

app.http("leadDocumentDownload", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "leads/{leadId}/documents/{documentId}/download",
  handler: leadDocumentDownload,
});
