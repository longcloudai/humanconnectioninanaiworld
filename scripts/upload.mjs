#!/usr/bin/env node
/**
 * Sync the local `documents/` folder to the R2 bucket that backs the portal.
 *
 *   npm run upload            # upload everything in documents/
 *   npm run upload -- --dry   # show what would be uploaded, change nothing
 *
 * Files keep their path relative to documents/ as the R2 key, so
 *   documents/handouts/agenda.pdf  ->  key "handouts/agenda.pdf"
 * which the portal lists and serves automatically.
 *
 * This shells out to `wrangler r2 object put`, so whatever Cloudflare account
 * `wrangler` is logged into (or CLOUDFLARE_API_TOKEN points at) is the target.
 */

import { readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, sep, extname } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DOCS_DIR = join(ROOT, "documents");
const BUCKET = "hciaw-documents"; // keep in sync with wrangler.jsonc bucket_name
const DRY_RUN = process.argv.includes("--dry");

const CONTENT_TYPES = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".txt": "text/plain",
  ".csv": "text/csv",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".zip": "application/zip",
};

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith(".")) continue; // skip .gitkeep, .DS_Store, etc.
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

if (!existsSync(DOCS_DIR)) {
  console.error(`No documents/ folder found at ${DOCS_DIR}`);
  process.exit(1);
}

const files = walk(DOCS_DIR);
if (files.length === 0) {
  console.log("documents/ is empty — nothing to upload. Drop files in and re-run.");
  process.exit(0);
}

console.log(`${DRY_RUN ? "[dry run] " : ""}Uploading ${files.length} file(s) to r2://${BUCKET}\n`);

let failures = 0;
for (const file of files) {
  const key = relative(DOCS_DIR, file).split(sep).join("/");
  const contentType = CONTENT_TYPES[extname(file).toLowerCase()];
  const target = `${BUCKET}/${key}`;

  const args = ["wrangler", "r2", "object", "put", target, "--file", file, "--remote"];
  if (contentType) args.push("--content-type", contentType);

  console.log(`  ${key}${contentType ? `  (${contentType})` : ""}`);
  if (DRY_RUN) continue;

  const res = spawnSync("npx", args, { stdio: ["ignore", "ignore", "inherit"] });
  if (res.status !== 0) {
    failures++;
    console.error(`    ✗ failed to upload ${key}`);
  }
}

console.log("");
if (DRY_RUN) {
  console.log("Dry run complete. Re-run without --dry to upload.");
} else if (failures) {
  console.error(`Done with ${failures} failure(s).`);
  process.exit(1);
} else {
  console.log("All documents uploaded. They are now live on the portal.");
}
