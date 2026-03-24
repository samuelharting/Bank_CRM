import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import ExcelJS from "exceljs";
import { LeadSource, LeadStatus, Prisma, UserRole } from "@prisma/client";
import { prisma } from "../db/client.js";
import { corsHeaders, handleCorsPreflight, requireAuth } from "../middleware/auth.js";
import { isReadOnlyRole } from "../middleware/scope.js";
import { AuthenticatedUser } from "../types/index.js";

const MAX_IMPORT_ROWS = Number(process.env.MAX_IMPORT_ROWS ?? "500");
const MAX_PREVIEW_BYTES = Number(process.env.MAX_IMPORT_PREVIEW_BYTES ?? String(5 * 1024 * 1024));

const getTempDir = (): string => process.env.LOCAL_IMPORT_TEMP_DIR ?? path.join(process.cwd(), ".import-temp");

const previewPath = (previewId: string): string => path.join(getTempDir(), `${previewId}.xlsx`);
const metaPath = (previewId: string): string => path.join(getTempDir(), `${previewId}.meta.json`);

interface PreviewMeta {
  userId: string;
  originalFileName: string;
  createdAt: string;
}

export interface ColumnMapping {
  firstName?: string | null;
  lastName?: string | null;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  industryCode?: string | null;
  addressLine1?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  pipelineValue?: string | null;
  branch?: string | null;
  notes?: string | null;
  nextFollowUp?: string | null;
  status?: string | null;
  source?: string | null;
}

const cellToString = (cell: ExcelJS.Cell): string => {
  const v = cell.value;
  if (v == null) return "";
  if (typeof v === "object" && v !== null && "text" in v && typeof (v as { text: string }).text === "string") {
    return String((v as { text: string }).text).trim();
  }
  if (typeof v === "object" && v !== null && "result" in v) {
    return cellToString({ ...cell, value: (v as { result: unknown }).result } as ExcelJS.Cell);
  }
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
};

const cellToNumber = (cell: ExcelJS.Cell): number | undefined => {
  const v = cell.value;
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  if (typeof v === "string") {
    const n = Number(String(v).replace(/[$,]/g, ""));
    if (!Number.isNaN(n)) return n;
  }
  return undefined;
};

const cellToDate = (cell: ExcelJS.Cell): Date | undefined => {
  const v = cell.value;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v;
  if (typeof v === "number" && v > 20000 && v < 120000) {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    return new Date(epoch.getTime() + v * 86400000);
  }
  if (typeof v === "string" && v.trim()) {
    const d = new Date(v.trim());
    if (!Number.isNaN(d.getTime())) return d;
  }
  return undefined;
};

const headerIndex = (headers: string[], mapping: string | null | undefined): number | undefined => {
  if (!mapping?.trim()) return undefined;
  const target = mapping.trim().toLowerCase();
  const idx = headers.findIndex((h) => h.trim().toLowerCase() === target);
  return idx >= 0 ? idx : undefined;
};

const parseLeadStatus = (raw: string): LeadStatus | undefined => {
  const s = raw.trim().toUpperCase().replace(/\s+/g, "_");
  if ((Object.values(LeadStatus) as string[]).includes(s)) return s as LeadStatus;
  const map: Record<string, LeadStatus> = {
    NEW: LeadStatus.PROSPECT,
    PROSPECT: LeadStatus.PROSPECT,
    CONTACTED: LeadStatus.CONTACTED,
    QUALIFIED: LeadStatus.QUALIFIED,
    PROPOSAL: LeadStatus.PROPOSAL,
    IN_PROGRESS: LeadStatus.PROPOSAL,
    WON: LeadStatus.WON,
    LOST: LeadStatus.LOST,
    DORMANT: LeadStatus.DORMANT,
  };
  return map[s];
};

const parseLeadSource = (raw: string): LeadSource | undefined => {
  const s = raw.trim().toUpperCase().replace(/\s+/g, "_");
  if ((Object.values(LeadSource) as string[]).includes(s)) return s as LeadSource;
  return undefined;
};

const normalizeBranch = (auth: AuthenticatedUser, assigneeBranch: string | null, rowBranch: string | undefined): string | undefined => {
  const row = rowBranch?.trim();
  const assignee = assigneeBranch?.trim();
  if (auth.role === UserRole.BRANCH_MANAGER && auth.branch) {
    return auth.branch;
  }
  return row || assignee || undefined;
};

const getAssignableUser = async (
  auth: AuthenticatedUser,
  assigneeId: string,
): Promise<{ id: string; branch: string | null } | null> => {
  const assignee = await prisma.user.findFirst({
    where: { id: assigneeId, isActive: true },
    select: { id: true, branch: true, role: true },
  });
  if (!assignee) return null;
  if (auth.role === UserRole.SALES_REP) {
    return assignee.id === auth.id ? assignee : null;
  }
  if (auth.role === UserRole.BRANCH_MANAGER) {
    if (!auth.branch) return null;
    return assignee.branch === auth.branch ? assignee : null;
  }
  return assignee;
};

const cleanupStalePreviews = async (): Promise<void> => {
  const dir = getTempDir();
  let entries: string[] = [];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return;
  }
  const now = Date.now();
  const maxAge = 48 * 60 * 60 * 1000;
  for (const name of entries) {
    if (!name.endsWith(".meta.json")) continue;
    const metaFile = path.join(dir, name);
    try {
      const raw = await fs.readFile(metaFile, "utf8");
      const meta = JSON.parse(raw) as PreviewMeta;
      const t = new Date(meta.createdAt).getTime();
      if (now - t > maxAge) {
        const id = name.replace(".meta.json", "");
        await fs.unlink(metaFile).catch(() => undefined);
        await fs.unlink(previewPath(id)).catch(() => undefined);
      }
    } catch {
      /* ignore */
    }
  }
};

export async function importPreview(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const preflight = handleCorsPreflight(request);
  if (preflight) return preflight;

  const auth = await requireAuth(request, context);
  if ("response" in auth) return auth.response;
  if (isReadOnlyRole(auth.user.role)) {
    return { status: 403, headers: corsHeaders(), jsonBody: { error: "Role is read-only" } };
  }

  try {
    await cleanupStalePreviews();

    const formData = await request.formData();
    const fileEntry = formData.get("file");
    if (!fileEntry || typeof fileEntry === "string") {
      return { status: 400, headers: corsHeaders(), jsonBody: { error: 'Multipart field "file" is required' } };
    }

    const blob = fileEntry as Blob;
    const buffer = Buffer.from(await blob.arrayBuffer());
    if (buffer.length > MAX_PREVIEW_BYTES) {
      return { status: 413, headers: corsHeaders(), jsonBody: { error: `File too large (max ${MAX_PREVIEW_BYTES} bytes)` } };
    }

    const originalFileName = (blob as File).name || "import.xlsx";
    if (!originalFileName.toLowerCase().endsWith(".xlsx")) {
      return { status: 400, headers: corsHeaders(), jsonBody: { error: "Only .xlsx files are supported" } };
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as Parameters<ExcelJS.Workbook["xlsx"]["load"]>[0]);
    const sheet = workbook.worksheets[0];
    if (!sheet) {
      return { status: 400, headers: corsHeaders(), jsonBody: { error: "Workbook has no sheets" } };
    }

    const headerRow = sheet.getRow(1);
    const headers: string[] = [];
    const maxCol = headerRow.actualCellCount || 32;
    for (let c = 1; c <= maxCol; c++) {
      headers.push(cellToString(headerRow.getCell(c)));
    }

    const sampleRows: string[][] = [];
    const maxSample = Math.min(5, sheet.actualRowCount);
    for (let r = 2; r <= maxSample; r++) {
      const row = sheet.getRow(r);
      const rowVals: string[] = [];
      for (let c = 1; c <= maxCol; c++) {
        rowVals.push(cellToString(row.getCell(c)));
      }
      sampleRows.push(rowVals);
    }

    const previewId = randomUUID();
    await fs.mkdir(getTempDir(), { recursive: true });
    await fs.writeFile(previewPath(previewId), buffer);
    const meta: PreviewMeta = {
      userId: auth.user.id,
      originalFileName,
      createdAt: new Date().toISOString(),
    };
    await fs.writeFile(metaPath(previewId), JSON.stringify(meta), "utf8");

    return {
      status: 200,
      headers: corsHeaders(),
      jsonBody: {
        previewId,
        headers,
        sampleRows,
        rowCount: Math.max(0, sheet.actualRowCount - 1),
        maxRows: MAX_IMPORT_ROWS,
      },
    };
  } catch (error) {
    context.error("Import preview failed", error);
    const message = error instanceof Error ? error.message : "Unexpected error";
    return { status: 500, headers: corsHeaders(), jsonBody: { error: "Preview failed", details: message } };
  }
}

export async function importExecute(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const preflight = handleCorsPreflight(request);
  if (preflight) return preflight;

  const auth = await requireAuth(request, context);
  if ("response" in auth) return auth.response;
  if (isReadOnlyRole(auth.user.role)) {
    return { status: 403, headers: corsHeaders(), jsonBody: { error: "Role is read-only" } };
  }

  try {
    const body = (await request.json()) as {
      previewId?: string;
      mapping?: ColumnMapping;
      assignedToId?: string;
    };

    if (!body.previewId || !body.mapping || !body.assignedToId) {
      return { status: 400, headers: corsHeaders(), jsonBody: { error: "previewId, mapping, and assignedToId are required" } };
    }

    const assignee = await getAssignableUser(auth.user, body.assignedToId);
    if (!assignee) {
      return { status: 403, headers: corsHeaders(), jsonBody: { error: "Cannot assign leads to the selected user" } };
    }

    let metaRaw: string;
    try {
      metaRaw = await fs.readFile(metaPath(body.previewId), "utf8");
    } catch {
      return { status: 404, headers: corsHeaders(), jsonBody: { error: "Preview expired or not found — upload again" } };
    }

    const meta = JSON.parse(metaRaw) as PreviewMeta;
    if (meta.userId !== auth.user.id) {
      return { status: 403, headers: corsHeaders(), jsonBody: { error: "Invalid preview" } };
    }

    let buffer: Buffer;
    try {
      buffer = await fs.readFile(previewPath(body.previewId));
    } catch {
      return { status: 404, headers: corsHeaders(), jsonBody: { error: "Preview file missing — upload again" } };
    }

    const m = body.mapping;
    if (!m.firstName?.trim() || !m.lastName?.trim()) {
      return { status: 400, headers: corsHeaders(), jsonBody: { error: "Mapping must include firstName and lastName column headers" } };
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as Parameters<ExcelJS.Workbook["xlsx"]["load"]>[0]);
    const sheet = workbook.worksheets[0];
    if (!sheet) {
      return { status: 400, headers: corsHeaders(), jsonBody: { error: "Workbook has no sheets" } };
    }

    const headerRow = sheet.getRow(1);
    const maxCol = headerRow.actualCellCount || 32;
    const headers: string[] = [];
    for (let c = 1; c <= maxCol; c++) {
      headers.push(cellToString(headerRow.getCell(c)));
    }

    const idx = {
      firstName: headerIndex(headers, m.firstName),
      lastName: headerIndex(headers, m.lastName),
      company: headerIndex(headers, m.company),
      email: headerIndex(headers, m.email),
      phone: headerIndex(headers, m.phone),
      industryCode: headerIndex(headers, m.industryCode),
      addressLine1: headerIndex(headers, m.addressLine1),
      city: headerIndex(headers, m.city),
      state: headerIndex(headers, m.state),
      postalCode: headerIndex(headers, m.postalCode),
      pipelineValue: headerIndex(headers, m.pipelineValue),
      branch: headerIndex(headers, m.branch),
      notes: headerIndex(headers, m.notes),
      nextFollowUp: headerIndex(headers, m.nextFollowUp),
      status: headerIndex(headers, m.status),
      source: headerIndex(headers, m.source),
    };

    if (idx.firstName === undefined || idx.lastName === undefined) {
      return { status: 400, headers: corsHeaders(), jsonBody: { error: "Could not find first or last name columns — check header names" } };
    }

    const errors: { row: number; message: string }[] = [];
    const leadsData: Prisma.LeadCreateManyInput[] = [];
    const seenEmails = new Set<string>();
    let skipped = 0;

    const lastRow = Math.min(sheet.actualRowCount, MAX_IMPORT_ROWS + 1);

    for (let r = 2; r <= lastRow; r++) {
      const row = sheet.getRow(r);
      const fn = cellToString(row.getCell(idx.firstName + 1));
      const ln = cellToString(row.getCell(idx.lastName + 1));
      if (!fn && !ln) {
        skipped += 1;
        continue;
      }
      if (!fn || !ln) {
        if (errors.length < 40) errors.push({ row: r, message: "Missing first or last name" });
        continue;
      }

      const emailRaw = idx.email !== undefined ? cellToString(row.getCell(idx.email + 1)) : "";
      const email = emailRaw || undefined;
      if (email) {
        const key = email.toLowerCase();
        if (seenEmails.has(key)) {
          skipped += 1;
          if (errors.length < 40) errors.push({ row: r, message: "Duplicate email in file" });
          continue;
        }
        seenEmails.add(key);
      }

      const company = idx.company !== undefined ? cellToString(row.getCell(idx.company + 1)) || undefined : undefined;
      const phone = idx.phone !== undefined ? cellToString(row.getCell(idx.phone + 1)) || undefined : undefined;
      const industryCode = idx.industryCode !== undefined ? cellToString(row.getCell(idx.industryCode + 1)) || undefined : undefined;
      const addressLine1 = idx.addressLine1 !== undefined ? cellToString(row.getCell(idx.addressLine1 + 1)) || undefined : undefined;
      const city = idx.city !== undefined ? cellToString(row.getCell(idx.city + 1)) || undefined : undefined;
      const state = idx.state !== undefined ? cellToString(row.getCell(idx.state + 1)) || undefined : undefined;
      const postalCode = idx.postalCode !== undefined ? cellToString(row.getCell(idx.postalCode + 1)) || undefined : undefined;
      const notes = idx.notes !== undefined ? cellToString(row.getCell(idx.notes + 1)) || undefined : undefined;

      let pipelineValue: number | undefined;
      if (idx.pipelineValue !== undefined) {
        const cell = row.getCell(idx.pipelineValue + 1);
        pipelineValue = cellToNumber(cell);
      }

      let nextFollowUp: Date | undefined;
      if (idx.nextFollowUp !== undefined) {
        const cell = row.getCell(idx.nextFollowUp + 1);
        nextFollowUp = cellToDate(cell);
      }

      const branchRaw = idx.branch !== undefined ? cellToString(row.getCell(idx.branch + 1)) : "";
      const branch = normalizeBranch(auth.user, assignee.branch, branchRaw || undefined);

      let status: LeadStatus = LeadStatus.PROSPECT;
      if (idx.status !== undefined) {
        const st = cellToString(row.getCell(idx.status + 1));
        if (st) {
          const parsed = parseLeadStatus(st);
          if (parsed) status = parsed;
        }
      }

      let source: LeadSource = LeadSource.OTHER;
      if (idx.source !== undefined) {
        const so = cellToString(row.getCell(idx.source + 1));
        if (so) {
          const parsed = parseLeadSource(so);
          if (parsed) source = parsed;
        }
      }

      leadsData.push({
        firstName: fn,
        lastName: ln,
        company,
        email,
        phone,
        industryCode,
        addressLine1,
        city,
        state,
        postalCode,
        pipelineValue,
        notes,
        nextFollowUp,
        branch,
        status,
        source,
        assignedToId: assignee.id,
      });

      if (leadsData.length >= MAX_IMPORT_ROWS) break;
    }

    const failedCount = errors.length;
    let inserted = 0;

    if (leadsData.length > 0) {
      const chunkSize = 50;
      for (let i = 0; i < leadsData.length; i += chunkSize) {
        const chunk = leadsData.slice(i, i + chunkSize);
        const result = await prisma.lead.createMany({ data: chunk });
        inserted += result.count;
      }
    }

    const job = await prisma.importJob.create({
      data: {
        createdById: auth.user.id,
        originalFileName: meta.originalFileName,
        assignedToId: assignee.id,
        mappingJson: body.mapping as object,
        rowCount: lastRow - 1,
        insertedCount: inserted,
        failedCount,
        skippedCount: skipped,
        errorLog: errors.length ? JSON.stringify(errors.slice(0, 40)) : null,
      },
    });

    await fs.unlink(metaPath(body.previewId)).catch(() => undefined);
    await fs.unlink(previewPath(body.previewId)).catch(() => undefined);

    return {
      status: 200,
      headers: corsHeaders(),
      jsonBody: {
        jobId: job.id,
        insertedCount: inserted,
        failedCount,
        skippedCount: skipped,
        rowCount: lastRow - 1,
        errors: errors.slice(0, 20),
      },
    };
  } catch (error) {
    context.error("Import execute failed", error);
    const message = error instanceof Error ? error.message : "Unexpected error";
    return { status: 500, headers: corsHeaders(), jsonBody: { error: "Import failed", details: message } };
  }
}

export async function importJobsList(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const preflight = handleCorsPreflight(request);
  if (preflight) return preflight;

  const auth = await requireAuth(request, context);
  if ("response" in auth) return auth.response;
  if (isReadOnlyRole(auth.user.role)) {
    return { status: 403, headers: corsHeaders(), jsonBody: { error: "Role is read-only" } };
  }

  try {
    const limit = Math.min(Number(request.query.get("limit") ?? "25"), 100);
    const jobs = await prisma.importJob.findMany({
      where: { createdById: auth.user.id },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { createdBy: { select: { displayName: true } } },
    });
    return { status: 200, headers: corsHeaders(), jsonBody: { results: jobs } };
  } catch (error) {
    context.error("Import jobs list failed", error);
    return { status: 500, headers: corsHeaders(), jsonBody: { error: "Request failed" } };
  }
}

app.http("importPreview", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "imports/leads/preview",
  handler: importPreview,
});

app.http("importExecute", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  route: "imports/leads/execute",
  handler: importExecute,
});

app.http("importJobsList", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  route: "imports/jobs",
  handler: importJobsList,
});
