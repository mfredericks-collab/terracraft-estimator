"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const { estimate } = require("./lib/pricing");
const { createStore, validateContact } = require("./lib/leads");

const PUBLIC_DIR = path.join(__dirname, "public");
const ADMIN_FILE = path.join(__dirname, "private", "admin.html");
const FILES = {
  "/": "index.html",
  "/index.html": "index.html",
  "/styles.css": "styles.css",
  "/app.js": "app.js",
  "/favicon.svg": "favicon.svg",
};

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
};

function createApp({ leadsPath, admin } = {}) {
  const store = createStore(
    leadsPath || path.join(__dirname, "data", "leads.json")
  );
  const adminEnabled =
    admin === undefined ? process.env.SHOW_ADMIN === "1" : Boolean(admin);

  return http.createServer((req, res) => {
    handle(req, res, store, adminEnabled).catch((error) => {
      if (res.headersSent) return;
      const status = error.status || 500;
      const message =
        status === 400
          ? "Check the form and try again."
          : status === 413
            ? "That submission is too large."
            : "Something went wrong. Try again.";
      if (status === 500) console.error(error);
      sendJson(res, status, { error: message });
    });
  });
}

async function handle(req, res, store, adminEnabled) {
  const url = new URL(req.url, "http://localhost");
  const pathname = url.pathname;

  if (req.method === "GET" && pathname === "/favicon.ico") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "GET" && FILES[pathname]) {
    await sendFile(res, path.join(PUBLIC_DIR, FILES[pathname]));
    return;
  }

  if (req.method === "GET" && (pathname === "/admin" || pathname === "/api/leads")) {
    if (!adminEnabled) {
      sendJson(res, 404, { error: "Not found." });
      return;
    }
    if (pathname === "/admin") {
      await sendFile(res, ADMIN_FILE);
      return;
    }
    const leads = await store.list();
    sendJson(res, 200, { leads: leads.slice().reverse() });
    return;
  }

  if (req.method === "POST" && (pathname === "/api/quote" || pathname === "/api/leads")) {
    const body = await readJson(req);
    if (pathname === "/api/quote") {
      const priced = estimate(body, { strict: false });
      if (!priced.ok) {
        sendJson(res, 400, { error: priced.error });
        return;
      }
      sendJson(res, 200, {
        complete: priced.complete,
        quote: priced.publicQuote,
      });
      return;
    }

    const contact = validateContact(body);
    if (contact.error) {
      sendJson(res, 400, { error: contact.error });
      return;
    }
    const priced = estimate(body, { strict: true });
    if (!priced.ok) {
      sendJson(res, 400, { error: priced.error });
      return;
    }
    if (!priced.complete) {
      sendJson(res, 400, { error: "Enter the measurements for each part you selected." });
      return;
    }
    await store.add({
      contact: contact.value,
      inputs: priced.inputs,
      quote: priced.publicQuote,
      privateNotes: priced.privateNotes,
    });
    sendJson(res, 201, {
      ok: true,
      quote: priced.publicQuote,
    });
    return;
  }

  sendJson(res, 404, { error: "Not found." });
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

async function sendFile(res, filePath) {
  const data = await fs.promises.readFile(filePath);
  const ext = path.extname(filePath);
  res.writeHead(200, {
    "Content-Type": TYPES[ext] || "application/octet-stream",
    "Cache-Control": "no-store",
    "Content-Length": data.length,
  });
  res.end(data);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 32000) {
        reject(Object.assign(new Error("too large"), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8");
      if (!text) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(text));
      } catch {
        reject(Object.assign(new Error("bad json"), { status: 400 }));
      }
    });
    req.on("error", reject);
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  const host = process.env.HOST || "127.0.0.1";
  createApp().listen(port, host, () => {
    console.log(`Terracraft estimator at http://${host}:${port}`);
    if (process.env.SHOW_ADMIN === "1") {
      console.log(`Lead list at http://${host}:${port}/admin`);
    }
  });
}

module.exports = { createApp };
