# Human Connection in an AI World — Document Portal

A tiny, mobile-first document portal. Recipients scan a **QR code** (embedded in
an emailed PowerPoint pack) and land on a clean page listing documents you've
published. They tap to view PDFs/images inline, or download anything.

- **Front end:** a Cloudflare Worker that renders the list and streams files.
- **Storage:** a Cloudflare R2 bucket — you upload docs to it; recipients only read.
- **No accounts, no upload UI for recipients.** Access is public via the QR link.

```
documents/            <- drop your files here, then `npm run upload`
src/index.js          <- the Worker (portal page + file serving)
scripts/upload.mjs    <- syncs documents/ -> R2
scripts/qr.mjs        <- generates the QR code image for the slide deck
wrangler.jsonc        <- Worker + R2 config
```

## One-time setup

You need a [Cloudflare account](https://dash.cloudflare.com/sign-up) (the free
plan is enough) and Node.js 18+.

```bash
npm install                 # install wrangler + qrcode
npx wrangler login          # authenticate wrangler with your Cloudflare account
npm run bucket:create       # create the R2 bucket (hciaw-documents)
npm run deploy              # deploy the Worker
```

`npm run deploy` prints the live URL, e.g.
`https://hciaw-documents.<your-subdomain>.workers.dev`. That's the address the
QR code will point to.

> R2 requires enabling R2 in the Cloudflare dashboard once (Storage → R2). It has
> a generous free tier; no credit card is needed to start.

## Publishing documents

1. Put files in the `documents/` folder (subfolders are fine — they become part
   of the file's name/path).
2. Upload them:
   ```bash
   npm run upload            # or: npm run upload -- --dry  to preview
   ```
3. They appear on the portal immediately — no redeploy needed.

To **remove** a document, delete it from R2:
```bash
npx wrangler r2 object delete hciaw-documents/<filename> --remote
```

## Making the QR code for your PowerPoint

```bash
npm run qr -- https://hciaw-documents.<your-subdomain>.workers.dev
```

This writes `qr/qr-code.png` (1024px, drop straight into a slide) and
`qr/qr-code.svg` (vector, for print). Add a short line like *"Scan to access the
documents"* next to it.

## Customising

- **Title / tagline:** edit `vars.SITE_TITLE` and `vars.SITE_TAGLINE` in
  `wrangler.jsonc`, then `npm run deploy`.
- **Custom domain** (e.g. `docs.yourdomain.com`): add a route in the Cloudflare
  dashboard or `wrangler.jsonc`, then generate the QR against that domain.
- **Look & feel:** the page is a single self-contained template in
  `src/index.js` (`renderIndex`).

## Local preview

```bash
npm run dev
```

Runs the Worker locally against a local R2 emulation. Use
`npm run upload -- --dry` to check what would upload without touching R2.

## Notes on access

The portal is **public** — anyone with the URL (or the QR code) can read the
documents. That's by design for QR-based distribution. Don't publish anything
you wouldn't hand to everyone who receives the PowerPoint. If you later need
gated access, the Worker is the right place to add a passcode or token check.
