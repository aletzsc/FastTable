const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { URL } = require("node:url");
const { DatabaseSync } = require("node:sqlite");

const HOST = process.env.MARKETING_HOST || "0.0.0.0";
const PORT = Number(process.env.MARKETING_PORT || 4010);
const APK_DOWNLOAD_URL =
  process.env.MARKETING_APK_URL || "https://example.com/fasttable-latest.apk";

const ROOT_DIR = __dirname;
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const DATA_DIR = path.join(ROOT_DIR, "data");
const DB_PATH = path.join(DATA_DIR, "marketing.sqlite");

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
};

function createDatabase() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new DatabaseSync(DB_PATH);

  db.exec(`
    CREATE TABLE IF NOT EXISTS download_metrics (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      downloads INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  db.exec(`
    INSERT INTO download_metrics (id, downloads)
    VALUES (1, 0)
    ON CONFLICT(id) DO NOTHING;
  `);

  return db;
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

function getDownloads(db) {
  const row = db
    .prepare("SELECT downloads, updated_at FROM download_metrics WHERE id = 1")
    .get();

  return {
    downloads: Number(row?.downloads || 0),
    updatedAt: row?.updated_at || null,
  };
}

function incrementDownloads(db) {
  db.prepare(`
    UPDATE download_metrics
    SET downloads = downloads + 1, updated_at = CURRENT_TIMESTAMP
    WHERE id = 1;
  `).run();

  return getDownloads(db);
}

function toPublicPath(pathname) {
  if (pathname === "/") {
    return path.join(PUBLIC_DIR, "index.html");
  }

  const normalized = path.normalize(path.join(PUBLIC_DIR, pathname));
  if (!normalized.startsWith(PUBLIC_DIR)) {
    return null;
  }

  return normalized;
}

function serveStatic(res, pathname) {
  const filePath = toPublicPath(pathname);
  if (!filePath || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    return false;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = CONTENT_TYPES[ext] || "application/octet-stream";
  const fileBuffer = fs.readFileSync(filePath);

  res.writeHead(200, {
    "Content-Type": contentType,
    "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=300",
  });
  res.end(fileBuffer);
  return true;
}

function createServer() {
  const db = createDatabase();

  const server = http.createServer((req, res) => {
    try {
      const method = req.method || "GET";
      const requestUrl = new URL(req.url || "/", `http://${HOST}:${PORT}`);
      const pathname = requestUrl.pathname;

      if (method === "GET" && pathname === "/api/health") {
        return sendJson(res, 200, {
          ok: true,
          service: "fasttable-marketing-site",
          storage: "sqlite",
        });
      }

      if (method === "GET" && pathname === "/api/downloads") {
        return sendJson(res, 200, getDownloads(db));
      }

      if (method === "POST" && pathname === "/api/download/apk") {
        const stats = incrementDownloads(db);
        return sendJson(res, 200, {
          ...stats,
          apkUrl: APK_DOWNLOAD_URL,
        });
      }

      if (method === "GET" && pathname === "/download/apk") {
        incrementDownloads(db);
        res.writeHead(302, { Location: APK_DOWNLOAD_URL });
        res.end();
        return;
      }

      if (method === "GET") {
        const served = serveStatic(res, pathname);
        if (served) {
          return;
        }
      }

      sendJson(res, 404, { error: "Ruta no encontrada" });
    } catch (error) {
      console.error("Error in request:", error);
      sendJson(res, 500, { error: "Error interno del servidor" });
    }
  });

  return {
    server,
    close: () => {
      db.close();
      server.close();
    },
  };
}

if (require.main === module) {
  const { server } = createServer();
  server.listen(PORT, HOST, () => {
    console.log(`FastTable marketing listo en http://${HOST}:${PORT}`);
    console.log(`APK target: ${APK_DOWNLOAD_URL}`);
    console.log(`DB local: ${DB_PATH}`);
  });
}

module.exports = { createServer };
