import { BlobServiceClient } from "@azure/storage-blob";
import path from "node:path";
import fs from "node:fs/promises";

const DEFAULT_MAX_BYTES = 15 * 1024 * 1024;

export const getMaxUploadBytes = (): number => {
  const n = Number(process.env.MAX_UPLOAD_BYTES);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_BYTES;
};

const getContainerName = (): string => process.env.AZURE_STORAGE_CONTAINER ?? "lead-documents";

const getLocalDir = (): string =>
  process.env.LOCAL_DOCUMENT_STORAGE_DIR ?? path.join(process.cwd(), ".local-document-storage");

let azureContainer: ReturnType<BlobServiceClient["getContainerClient"]> | null = null;

const initAzure = (): boolean => {
  if (azureContainer) return true;
  const conn = process.env.AZURE_STORAGE_CONNECTION_STRING?.trim();
  if (!conn) return false;
  const client = BlobServiceClient.fromConnectionString(conn);
  azureContainer = client.getContainerClient(getContainerName());
  return true;
};

export const isAzureStorage = (): boolean => initAzure();

export const ensureAzureContainer = async (): Promise<void> => {
  if (!initAzure() || !azureContainer) return;
  await azureContainer.createIfNotExists();
};

export const putObject = async (key: string, data: Buffer, contentType: string): Promise<void> => {
  if (initAzure() && azureContainer) {
    await ensureAzureContainer();
    const block = azureContainer.getBlockBlobClient(key);
    await block.uploadData(data, {
      blobHTTPHeaders: { blobContentType: contentType },
    });
    return;
  }
  const base = getLocalDir();
  const full = path.join(base, key);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, data);
};

export const deleteObject = async (key: string): Promise<void> => {
  if (initAzure() && azureContainer) {
    await azureContainer.getBlockBlobClient(key).deleteIfExists();
    return;
  }
  const full = path.join(getLocalDir(), key);
  await fs.unlink(full).catch(() => undefined);
};

export const readObjectBuffer = async (key: string): Promise<Buffer> => {
  if (initAzure() && azureContainer) {
    const block = azureContainer.getBlockBlobClient(key);
    return block.downloadToBuffer();
  }
  const full = path.join(getLocalDir(), key);
  return fs.readFile(full);
};
