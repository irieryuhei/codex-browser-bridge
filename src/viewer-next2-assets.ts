import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));

function resolveViewerNext2Asset(relativePath: string): string {
  const candidates = [
    join(process.cwd(), "assets", "viewer-next2", relativePath),
    join(MODULE_DIR, "..", "..", "assets", "viewer-next2", relativePath),
    join(MODULE_DIR, "..", "assets", "viewer-next2", relativePath),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(`viewer-next2 asset was not found: ${relativePath}`);
}

export const VIEWER_NEXT2_CSS = readFileSync(resolveViewerNext2Asset("app.css"), "utf8");
export const VIEWER_NEXT2_JS = readFileSync(resolveViewerNext2Asset("app.js"), "utf8");
