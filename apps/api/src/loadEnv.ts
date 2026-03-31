/**
 * Load repo-root `.env` so `func start` sees the same vars as Prisma / Vite
 * (Azure Functions only auto-loads `local.settings.json` + machine env).
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { config } from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envCandidates = [
  path.resolve(__dirname, "../../../.env"),
  path.resolve(__dirname, "../../../../.env"),
];

const rootEnv = envCandidates.find((candidate) => existsSync(candidate));

if (rootEnv) {
  config({ path: rootEnv });
}
