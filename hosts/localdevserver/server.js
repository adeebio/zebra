// Zero-dependency dev server: serves /src live from the repo root so edits
// show up on refresh with no propagate/build step, unlike the other hosts.
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import http from "node:http";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..", "..");
const hostDir = __dirname;
const srcDir = path.join(rootDir, "src");
const markdownItDist = path.join(rootDir, "node_modules", "markdown-it", "dist");

const PORT = process.env.PORT || 3000;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

function contentTypeFor(filePath) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

// Resolves `requestPath` inside `root` and rejects anything that would
// escape it (e.g. via "..") since the URL path is mapped straight onto the
// filesystem below.
function resolveWithinRoot(root, requestPath) {
  const resolved = path.resolve(root, `.${requestPath}`);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    return null;
  }
  return resolved;
}

function serveFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": contentTypeFor(filePath) });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = decodeURIComponent(url.pathname);

  if (pathname === "/") {
    serveFile(res, path.join(hostDir, "index.html"));
    return;
  }

  if (pathname.startsWith("/src/")) {
    const filePath = resolveWithinRoot(srcDir, pathname.slice("/src".length));
    if (!filePath) {
      res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Forbidden");
      return;
    }
    serveFile(res, filePath);
    return;
  }

  if (pathname === "/vendor/markdown-it.min.js") {
    serveFile(res, path.join(markdownItDist, "markdown-it.min.js"));
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Not found");
});

server.listen(PORT, () => {
  console.log(`Serving Zebra at http://localhost:${PORT}`);
});
