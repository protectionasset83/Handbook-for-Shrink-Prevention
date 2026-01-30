/**
 * Shrink Prevention Website - Zero-dependency Node server
 *
 * Shared persistence across users via a simple JSON file store.
 * - Public read:  GET  /api/state
 * - Admin login:  POST /api/login   { password }
 * - Admin write:  PUT  /api/state   Authorization: Bearer <token>
 *
 * Admin password:
 *   - Set via environment variable ADMIN_PASSWORD
 *   - Defaults to "admin123" for convenience (change for production!)
 */

const http = require("http");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const os = require("os");
const { URL } = require("url");

const PORT = Number(process.env.PORT || 3000);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const TOKEN_TTL_HOURS = Number(process.env.TOKEN_TTL_HOURS || 24);

const DATA_FILE =
  process.env.DATA_FILE ||
  path.join(__dirname, "data", "state.json");

const PUBLIC_DIR = path.join(__dirname, "public");

function ensureDataFile() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    const initial = {
      rules: [],
      reasonCodes: [],
      lossCodes: [],
      updatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2), "utf-8");
  }
}

function readState() {
  ensureDataFile();
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    return {
      rules: Array.isArray(parsed.rules) ? parsed.rules : [],
      reasonCodes: Array.isArray(parsed.reasonCodes) ? parsed.reasonCodes : [],
      lossCodes: Array.isArray(parsed.lossCodes) ? parsed.lossCodes : [],
      updatedAt: parsed.updatedAt || null,
    };
  } catch {
    return { rules: [], reasonCodes: [], lossCodes: [], updatedAt: null };
  }
}

function atomicWriteState(next) {
  ensureDataFile();
  const dir = path.dirname(DATA_FILE);
  const tmp = path.join(
    dir,
    `state.tmp.${Date.now()}.${Math.random().toString(16).slice(2)}`
  );
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2), "utf-8");
  fs.renameSync(tmp, DATA_FILE);
}

const tokens = new Map(); // token -> expiresAtMs

function issueToken() {
  const token = crypto.randomUUID();
  const expiresAt = Date.now() + TOKEN_TTL_HOURS * 60 * 60 * 1000;
  tokens.set(token, expiresAt);
  return token;
}

function isValidToken(token) {
  if (!token) return false;
  const expiresAt = tokens.get(token);
  if (!expiresAt) return false;
  if (Date.now() > expiresAt) {
    tokens.delete(token);
    return false;
  }
  return true;
}

function cleanupTokens() {
  const now = Date.now();
  for (const [tok, exp] of tokens.entries()) {
    if (now > exp) tokens.delete(tok);
  }
}
setInterval(cleanupTokens, 60 * 60 * 1000).unref();

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

function sendJson(res, status, obj) {
  const data = Buffer.from(JSON.stringify(obj));
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": data.length,
    "Cache-Control": "no-store",
  });
  res.end(data);
}

function sendText(res, status, text, contentType = "text/plain; charset=utf-8") {
  const data = Buffer.from(text);
  res.writeHead(status, {
    "Content-Type": contentType,
    "Content-Length": data.length,
    "Cache-Control": "no-store",
  });
  res.end(data);
}

function readBodyJson(req, maxBytes = 2_000_000) {
  return new Promise((resolve, reject) => {
    let bytes = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      bytes += chunk.length;
      if (bytes > maxBytes) {
        reject(new Error("Payload too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf-8");
        const parsed = raw ? JSON.parse(raw) : {};
        resolve(parsed);
      } catch (e) {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function normalizePath(urlPath) {
  // Prevent directory traversal
  const decoded = decodeURIComponent(urlPath);
  const withoutQuery = decoded.split("?")[0];
  const safe = path.normalize(withoutQuery).replace(/^(\.\.[\/\\])+/, "");
  return safe;
}

function serveStatic(req, res, urlPath) {
  const safePath = normalizePath(urlPath === "/" ? "/index.html" : urlPath);
  const filePath = path.join(PUBLIC_DIR, safePath);

  // Ensure file is inside PUBLIC_DIR
  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendText(res, 403, "Forbidden");
    return;
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      // SPA fallback to index.html
      const indexPath = path.join(PUBLIC_DIR, "index.html");
      fs.readFile(indexPath, (err2, data2) => {
        if (err2) return sendText(res, 404, "Not found");
        res.writeHead(200, { "Content-Type": MIME[".html"] || "text/html" });
        res.end(data2);
      });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const ct = MIME[ext] || "application/octet-stream";
    fs.readFile(filePath, (err3, data) => {
      if (err3) return sendText(res, 500, "Server error");
      res.writeHead(200, {
        "Content-Type": ct,
        "Content-Length": data.length,
        // If you deploy behind caching, you can adjust this.
        "Cache-Control": "no-cache",
      });
      res.end(data);
    });
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const pathname = url.pathname || "/";
    const method = (req.method || "GET").toUpperCase();

    // API routes
    if (pathname === "/api/state" && method === "GET") {
      return sendJson(res, 200, readState());
    }

    if (pathname === "/api/login" && method === "POST") {
      const body = await readBodyJson(req).catch((e) => {
        return { __error: e.message };
      });
      if (body.__error) return sendJson(res, 400, { error: body.__error });

      const password = (body.password ? String(body.password) : "").trim();
      if (!password) return sendJson(res, 400, { error: "Password required" });

      if (password !== ADMIN_PASSWORD) {
        return sendJson(res, 401, { error: "Invalid password" });
      }

      const token = issueToken();
      return sendJson(res, 200, { token, expiresInHours: TOKEN_TTL_HOURS });
    }

    if (pathname === "/api/state" && method === "PUT") {
      const auth = req.headers.authorization || "";
      const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;

      if (!isValidToken(token)) {
        return sendJson(res, 401, { error: "Unauthorized" });
      }

      const body = await readBodyJson(req).catch((e) => {
        return { __error: e.message };
      });
      if (body.__error) return sendJson(res, 400, { error: body.__error });

      const next = {
        rules: Array.isArray(body.rules) ? body.rules : [],
        reasonCodes: Array.isArray(body.reasonCodes) ? body.reasonCodes : [],
        lossCodes: Array.isArray(body.lossCodes) ? body.lossCodes : [],
        updatedAt: new Date().toISOString(),
      };

      atomicWriteState(next);
      return sendJson(res, 200, { ok: true, updatedAt: next.updatedAt });
    }

    // Static website
    return serveStatic(req, res, pathname);
  } catch (e) {
    sendText(res, 500, "Server error");
  }
});

// Bind to all interfaces so other devices on the same network can reach it.
server.listen(PORT, "0.0.0.0", () => {
  const ifaces = os.networkInterfaces();
  const ips = [];
  for (const list of Object.values(ifaces)) {
    for (const info of list || []) {
      // Prefer IPv4 LAN addresses that other devices can reach
      if (info.family === "IPv4" && !info.internal) {
        ips.push(info.address);
      }
    }
  }

  console.log(`Shrink Prevention site running:`);
  console.log(`  Local:   http://localhost:${PORT}`);
  if (ips.length) {
    console.log(`  LAN:     ${ips.map(ip => `http://${ip}:${PORT}`).join("  ")}`);
    console.log(`  (Share one of the LAN links with others on the same network.)`);
  } else {
    console.log(`  LAN:     (no external LAN IP detected)`);
  }
  console.log(`Shared data file: ${DATA_FILE}`);
  console.log(`ADMIN_PASSWORD is set via env var (default is "admin123").`);
});
