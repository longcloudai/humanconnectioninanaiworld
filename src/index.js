/**
 * Document portal Worker.
 *
 * Recipients scan a QR code (embedded in an emailed PowerPoint pack) and land
 * on `/`, which lists every document stored in the R2 bucket. Files are streamed
 * from `/d/<key>` — PDFs and images open inline in the browser, everything else
 * downloads.
 *
 * There is intentionally no upload path here: documents are pushed to R2 by the
 * admin via `npm run upload` (see scripts/upload.mjs). This endpoint is public,
 * which is what QR-based access requires.
 */

const INLINE_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "text/plain",
]);

const EXT_CONTENT_TYPE = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  txt: "text/plain; charset=utf-8",
  csv: "text/csv; charset=utf-8",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  zip: "application/zip",
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405 });
    }

    if (url.pathname === "/" || url.pathname === "") {
      return renderIndex(request, env);
    }

    if (url.pathname.startsWith("/d/")) {
      const key = decodeURIComponent(url.pathname.slice(3));
      return serveDocument(env, key, url.searchParams.has("download"));
    }

    if (url.pathname === "/favicon.ico") {
      return new Response(null, { status: 204 });
    }

    return new Response("Not found", { status: 404 });
  },
};

async function listDocuments(env) {
  const items = [];
  let cursor;
  do {
    const page = await env.DOCS.list({ cursor, limit: 1000 });
    for (const obj of page.objects) {
      // Skip "folder placeholder" keys and hidden files.
      if (obj.key.endsWith("/") || obj.key.split("/").pop().startsWith(".")) continue;
      items.push(obj);
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  items.sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }));
  return items;
}

async function serveDocument(env, key, forceDownload) {
  if (!key) return new Response("Not found", { status: 404 });

  const object = await env.DOCS.get(key);
  if (!object) return new Response("Document not found", { status: 404 });

  const ext = key.split(".").pop().toLowerCase();
  const contentType =
    object.httpMetadata?.contentType || EXT_CONTENT_TYPE[ext] || "application/octet-stream";

  const filename = key.split("/").pop();
  const disposition =
    !forceDownload && INLINE_TYPES.has(contentType.split(";")[0]) ? "inline" : "attachment";

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("content-type", contentType);
  headers.set("etag", object.httpEtag);
  headers.set(
    "content-disposition",
    `${disposition}; filename="${filename.replace(/"/g, "")}"`
  );
  headers.set("cache-control", "public, max-age=300");

  return new Response(object.body, { headers });
}

function formatSize(bytes) {
  if (!bytes && bytes !== 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n < 10 && i > 0 ? n.toFixed(1) : Math.round(n)} ${units[i]}`;
}

function iconFor(ext) {
  if (ext === "pdf") return "📄";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) return "🖼️";
  if (["doc", "docx"].includes(ext)) return "📝";
  if (["xls", "xlsx", "csv"].includes(ext)) return "📊";
  if (["ppt", "pptx"].includes(ext)) return "📽️";
  if (ext === "zip") return "🗜️";
  return "📎";
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

async function renderIndex(request, env) {
  const title = env.SITE_TITLE || "Documents";
  const tagline = env.SITE_TAGLINE || "";
  let docs = [];
  let listError = null;
  try {
    docs = await listDocuments(env);
  } catch (err) {
    listError = err;
  }

  const rows = docs
    .map((obj) => {
      const name = obj.key.split("/").pop();
      const ext = name.includes(".") ? name.split(".").pop().toLowerCase() : "";
      const href = `/d/${obj.key.split("/").map(encodeURIComponent).join("/")}`;
      return `
        <li class="doc">
          <a class="doc-link" href="${escapeHtml(href)}">
            <span class="doc-icon" aria-hidden="true">${iconFor(ext)}</span>
            <span class="doc-body">
              <span class="doc-name">${escapeHtml(name)}</span>
              <span class="doc-meta">${escapeHtml(formatSize(obj.size))}</span>
            </span>
            <span class="doc-chevron" aria-hidden="true">›</span>
          </a>
          <a class="doc-dl" href="${escapeHtml(href)}?download" title="Download" aria-label="Download ${escapeHtml(name)}">⤓</a>
        </li>`;
    })
    .join("");

  const emptyState = listError
    ? `<p class="empty">Documents are temporarily unavailable. Please try again shortly.</p>`
    : `<p class="empty">No documents have been published yet. Please check back soon.</p>`;

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)}</title>
<style>
  :root {
    --bg: #0f1420;
    --card: #1a2130;
    --card-hover: #222b3d;
    --text: #eef2f9;
    --muted: #93a0b8;
    --accent: #5b8cff;
    --border: #2a344a;
  }
  @media (prefers-color-scheme: light) {
    :root {
      --bg: #f4f6fb;
      --card: #ffffff;
      --card-hover: #f0f4ff;
      --text: #16202f;
      --muted: #5c6a82;
      --accent: #2f6bff;
      --border: #e3e8f2;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background: var(--bg);
    color: var(--text);
    -webkit-font-smoothing: antialiased;
    line-height: 1.5;
  }
  .wrap { max-width: 720px; margin: 0 auto; padding: 32px 20px 64px; }
  header { margin-bottom: 28px; }
  h1 { font-size: 1.5rem; margin: 0 0 4px; letter-spacing: -0.01em; }
  .tagline { color: var(--muted); margin: 0; font-size: 0.95rem; }
  ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
  .doc {
    display: flex; align-items: stretch;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 14px;
    overflow: hidden;
    transition: background 0.15s ease, transform 0.05s ease;
  }
  .doc:active { transform: scale(0.995); }
  .doc-link {
    flex: 1; display: flex; align-items: center; gap: 14px;
    padding: 16px 14px 16px 16px;
    text-decoration: none; color: inherit; min-width: 0;
  }
  .doc:hover { background: var(--card-hover); }
  .doc-icon { font-size: 1.6rem; flex-shrink: 0; }
  .doc-body { display: flex; flex-direction: column; min-width: 0; }
  .doc-name { font-weight: 600; word-break: break-word; }
  .doc-meta { color: var(--muted); font-size: 0.82rem; }
  .doc-chevron { color: var(--muted); font-size: 1.4rem; flex-shrink: 0; }
  .doc-dl {
    display: flex; align-items: center; padding: 0 18px;
    text-decoration: none; color: var(--muted); font-size: 1.3rem;
    border-left: 1px solid var(--border);
  }
  .doc-dl:hover { color: var(--accent); background: var(--card-hover); }
  .empty {
    text-align: center; color: var(--muted);
    padding: 48px 16px; border: 1px dashed var(--border); border-radius: 14px;
  }
  footer { margin-top: 40px; text-align: center; color: var(--muted); font-size: 0.8rem; }
</style>
</head>
<body>
  <div class="wrap">
    <header>
      <h1>${escapeHtml(title)}</h1>
      ${tagline ? `<p class="tagline">${escapeHtml(tagline)}</p>` : ""}
    </header>
    ${docs.length ? `<ul>${rows}</ul>` : emptyState}
    <footer>Tap a document to open it, or ⤓ to download.</footer>
  </div>
</body>
</html>`;

  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}
