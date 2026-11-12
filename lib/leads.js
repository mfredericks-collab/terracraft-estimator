"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function createStore(filePath) {
  let chain = Promise.resolve();

  function update(work) {
    const run = chain.then(work, work);
    chain = run.then(
      () => {},
      () => {}
    );
    return run;
  }

  async function readAll() {
    try {
      const raw = await fs.promises.readFile(filePath, "utf8");
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw error;
    }
  }

  async function writeAll(leads) {
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    const temp = `${filePath}.${process.pid}.tmp`;
    await fs.promises.writeFile(temp, JSON.stringify(leads, null, 2));
    await fs.promises.rename(temp, filePath);
  }

  return {
    list() {
      return update(() => readAll());
    },
    add(lead) {
      return update(async () => {
        const leads = await readAll();
        const saved = {
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
          ...lead,
        };
        leads.push(saved);
        await writeAll(leads);
        return saved;
      });
    },
  };
}

function cleanText(value, max) {
  return String(value ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim()
    .slice(0, max);
}

function digits(value) {
  return cleanText(value, 40).replace(/\D/g, "");
}

function validateContact(body) {
  const contact = body && typeof body === "object" ? body : {};
  const name = cleanText(contact.name, 80);
  const phone = cleanText(contact.phone, 40);
  const email = cleanText(contact.email, 120);
  const city = cleanText(contact.city, 80);

  if (name.length < 2) return { error: "Enter your name." };
  if (city.length < 2) return { error: "Enter your city." };

  const phoneDigits = digits(phone);
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!phone && !email) return { error: "Enter a phone number or an email." };
  if (phone && phoneDigits.length < 10) return { error: "Enter a 10-digit phone number." };
  if (email && !emailOk) return { error: "Enter a valid email address." };

  return {
    value: {
      name,
      phone,
      email,
      city,
    },
  };
}

module.exports = { createStore, validateContact };
