#!/usr/bin/env node
/**
 * Generate the QR code that goes into the PowerPoint pack.
 *
 *   npm run qr -- https://hciaw-documents.<your-subdomain>.workers.dev
 *
 * Writes two files into qr/:
 *   qr-code.png  — high-resolution, drop straight into a slide
 *   qr-code.svg  — vector, for print or resizing without blur
 *
 * Point it at your deployed Worker URL (or a custom domain if you set one up).
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

let QRCode;
try {
  QRCode = (await import("qrcode")).default;
} catch {
  console.error("The 'qrcode' package isn't installed. Run `npm install` first.");
  process.exit(1);
}

const url = process.argv[2];
if (!url || !/^https?:\/\//i.test(url)) {
  console.error("Usage: npm run qr -- <https://your-worker-url>");
  process.exit(1);
}

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const OUT_DIR = join(ROOT, "qr");
mkdirSync(OUT_DIR, { recursive: true });

const options = {
  errorCorrectionLevel: "M",
  margin: 2,
  color: { dark: "#000000", light: "#ffffff" },
};

const pngPath = join(OUT_DIR, "qr-code.png");
const svgPath = join(OUT_DIR, "qr-code.svg");

await QRCode.toFile(pngPath, url, { ...options, type: "png", width: 1024 });
const svg = await QRCode.toString(url, { ...options, type: "svg" });
writeFileSync(svgPath, svg);

console.log(`QR code for ${url}`);
console.log(`  ${pngPath}`);
console.log(`  ${svgPath}`);
console.log("\nDrop qr-code.png into your PowerPoint slide.");
