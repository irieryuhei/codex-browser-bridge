import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));

function resolveViewerNext3Asset(relativePath: string): string {
  const candidates = [
    join(process.cwd(), "assets", "viewer-next3", relativePath),
    join(MODULE_DIR, "..", "..", "assets", "viewer-next3", relativePath),
    join(MODULE_DIR, "..", "assets", "viewer-next3", relativePath),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(`viewer-next3 asset was not found: ${relativePath}`);
}

export const VIEWER_NEXT3_CSS = readFileSync(resolveViewerNext3Asset("app.css"), "utf8");
export const VIEWER_NEXT3_JS = readFileSync(resolveViewerNext3Asset("app.js"), "utf8");
