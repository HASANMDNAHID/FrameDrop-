import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dns from "node:dns/promises";
import ipaddr from "ipaddr.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 3000);
const MAX_BYTES = Number(process.env.MAX_DOWNLOAD_BYTES || 500 * 1024 * 1024);
const REDIRECTS = 5;

app.disable("x-powered-by");
app.use(express.json({ limit: "16kb" }));
app.use(express.static(path.join(__dirname, "public"), { extensions: ["html"] }));

function isPublicAddress(address) {
  try {
    const parsed = ipaddr.parse(address);
    return parsed.range() === "unicast";
  } catch {
    return false;
  }
}

async function validateRemoteUrl(raw) {
  let url;
  try { url = new URL(raw); } catch { throw new Error("Enter a valid video URL."); }
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Only HTTP and HTTPS URLs are supported.");
  if (url.username || url.password) throw new Error("URLs containing credentials are not allowed.");
  if (url.port && !["80", "443"].includes(url.port)) throw new Error("Only standard web ports (80 and 443) are allowed.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) {
    throw new Error("This host is not allowed.");
  }
  let addresses;
  try {
    addresses = ipaddr.isValid(host) ? [host] : (await dns.lookup(host, { all: true })).map(x => x.address);
  } catch {
    throw new Error("The video host could not be resolved.");
  }
  if (!addresses.length || addresses.some(a => !isPublicAddress(a))) {
    throw new Error("Private or local network addresses are not allowed.");
  }
  return url;
}

async function safeFetch(rawUrl, method = "GET", headers = {}) {
  let current = rawUrl;
  for (let hop = 0; hop <= REDIRECTS; hop++) {
    const url = await validateRemoteUrl(current);
    const response = await fetch(url, {
      method,
      headers,
      redirect: "manual",
      signal: AbortSignal.timeout(30_000)
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (!location || hop === REDIRECTS) throw new Error("Too many or invalid redirects.");
      current = new URL(location, url).toString();
      continue;
    }
    return response;
  }
  throw new Error("Unable to reach the video source.");
}

function safeFilename(input, fallback = "video") {
  return String(input || fallback).replace(/[^\w.-]+/g, "_").replace(/^\.+/, "").slice(0, 100) || fallback;
}

app.post("/api/download", async (req, res) => {
  let upstream;
  try {
    const source = req.body?.url;
    if (typeof source !== "string" || source.length > 4096) {
      return res.status(400).json({ error: "Paste a valid direct video URL." });
    }
    upstream = await safeFetch(source, "GET", { "user-agent": "AuthorizedVideoDownloader/1.0" });
    if (!upstream.ok) {
      await upstream.body?.cancel();
      return res.status(502).json({ error: `The source returned HTTP ${upstream.status}.` });
    }

    const type = (upstream.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    const length = Number(upstream.headers.get("content-length") || 0);
    const pathname = new URL(source).pathname;
    const looksLikeVideo = type.startsWith("video/") || /\.(mp4|webm|mov|m4v|ogv|ogg)$/i.test(pathname);
    if (!looksLikeVideo) {
      await upstream.body?.cancel();
      return res.status(415).json({ error: "This URL does not appear to point directly to a video file." });
    }
    if (length > MAX_BYTES) {
      await upstream.body?.cancel();
      return res.status(413).json({ error: "This video exceeds the 500 MB download limit." });
    }

    const extFromType = ({ "video/mp4": ".mp4", "video/webm": ".webm", "video/quicktime": ".mov", "video/ogg": ".ogv" })[type] || "";
    const extFromPath = path.extname(pathname).slice(0, 8);
    const filename = safeFilename(path.basename(pathname, extFromPath) || "video") + (extFromPath || extFromType || ".video");
    res.status(200);
    res.setHeader("Content-Type", type || "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Cache-Control", "no-store");
    if (length) res.setHeader("Content-Length", String(length));
    if (!upstream.body) return res.end();
    const reader = upstream.body.getReader();
    req.on("close", () => reader.cancel().catch(() => {}));
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!res.write(Buffer.from(value))) await new Promise(resolve => res.once("drain", resolve));
    }
    res.end();
  } catch (error) {
    if (upstream?.body) await upstream.body.cancel().catch(() => {});
    if (!res.headersSent) res.status(400).json({ error: error.message || "Download failed. Check the URL and try again." });
    else res.destroy(error);
  }
});

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.listen(PORT, () => console.log(`Video Downloader running at http://localhost:${PORT}`));
