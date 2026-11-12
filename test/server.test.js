"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createApp } = require("../server");

async function start(admin) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "terracraft-"));
  const leadsPath = path.join(dir, "leads.json");
  const server = createApp({ leadsPath, admin });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return {
    base: `http://127.0.0.1:${port}`,
    leadsPath,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

async function post(base, pathname, body) {
  const response = await fetch(`${base}${pathname}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await response.json();
  return { status: response.status, json };
}

test("public files do not mention internal pricing", () => {
  const dir = path.join(__dirname, "..", "public");
  const banned = ["geogrid", "break-even", "breakeven", "markup", "piece rate", "crew rate"];
  for (const name of fs.readdirSync(dir)) {
    const text = fs.readFileSync(path.join(dir, name), "utf8").toLowerCase();
    for (const word of banned) {
      assert.equal(text.includes(word), false, `${name} contains ${word}`);
    }
  }
  const client = ["index.html", "app.js"]
    .map((name) => fs.readFileSync(path.join(dir, name), "utf8").toLowerCase())
    .join("\n");
  assert.equal(client.includes("margin"), false);
  assert.match(client, /larger jobs cost less per square foot/);
  const page = fs.readFileSync(path.join(dir, "index.html"), "utf8");
  assert.match(page, /<title>UQuote/);
  assert.match(page, /<h1>UQuote<\/h1>/);
  assert.equal(page.toLowerCase().includes("terracraft"), false);
});

test("quote and lead APIs hide the cost stack", async () => {
  const app = await start(false);
  try {
    const quote = await post(app.base, "/api/quote", {
      project: "wall",
      wall: { lengthFt: 40, heightFt: 3.5 },
    });
    assert.equal(quote.status, 200);
    assert.equal(quote.json.quote.sections[0].rate, 97.86);
    assert.equal(quote.json.quote.sections[0].total, 13700.4);
    const body = JSON.stringify(quote.json).toLowerCase();
    assert.equal(body.includes("break-even"), false);
    assert.equal(body.includes("geogrid"), false);
    assert.equal(quote.json.privateNotes, undefined);

    const saved = await post(app.base, "/api/leads", {
      project: "wall",
      wall: { lengthFt: 40, heightFt: 3.5 },
      name: "Jordan Lee",
      phone: "(555) 010-1234",
      email: "",
      city: "Bend",
    });
    assert.equal(saved.status, 201);
    assert.equal(saved.json.quote.sections[0].total, 13700.4);
    assert.equal(JSON.stringify(saved.json).toLowerCase().includes("break-even"), false);

    const stored = JSON.parse(fs.readFileSync(app.leadsPath, "utf8"));
    assert.equal(stored.length, 1);
    assert.equal(stored[0].contact.city, "Bend");
    assert.equal(stored[0].inputs.wall.lengthFt, 40);
    assert.deepEqual(stored[0].privateNotes, ["Taller-wall price is included."]);
    assert.equal(JSON.stringify(stored).toLowerCase().includes("break-even"), false);
    assert.equal(stored[0].quote.sections[0].rate, 97.86);

    const hidden = await fetch(`${app.base}/api/leads`);
    assert.equal(hidden.status, 404);
    const adminPage = await fetch(`${app.base}/admin`);
    assert.equal(adminPage.status, 404);
  } finally {
    await app.close();
  }
});

test("admin flag lists saved leads", async () => {
  const app = await start(true);
  try {
    const saved = await post(app.base, "/api/leads", {
      project: "pavers",
      pavers: { areaSf: 400, shape: "straight", access: "easy" },
      name: "Avery Stone",
      phone: "",
      email: "avery@example.com",
      city: "Redmond",
    });
    assert.equal(saved.status, 201);
    const leads = await fetch(`${app.base}/api/leads`);
    assert.equal(leads.status, 200);
    const json = await leads.json();
    assert.equal(json.leads[0].contact.email, "avery@example.com");
    assert.equal(json.leads[0].quote.sections[0].rate, 32.5);
    assert.equal(json.leads[0].quote.sections[0].total, 13000);
    const page = await fetch(`${app.base}/admin`);
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /Leads/);
  } finally {
    await app.close();
  }
});

test("a lead needs a name, a city, and a phone or email", async () => {
  const app = await start(false);
  try {
    const missing = await post(app.base, "/api/leads", {
      project: "pavers",
      pavers: { areaSf: 100, shape: "straight", access: "easy" },
      name: "Sam",
      city: "Bend",
    });
    assert.equal(missing.status, 400);
    const emailOnly = await post(app.base, "/api/leads", {
      project: "pavers",
      pavers: { areaSf: 100, shape: "straight", access: "easy" },
      name: "Sam",
      email: "sam@example.com",
      city: "Bend",
    });
    assert.equal(emailOnly.status, 201);
  } finally {
    await app.close();
  }
});
