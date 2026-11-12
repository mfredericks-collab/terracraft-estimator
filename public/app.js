"use strict";

const form = document.querySelector("#estimate");
const paverFields = document.querySelector("#paver-fields");
const wallFields = document.querySelector("#wall-fields");
const priceEl = document.querySelector("#price");
const leadFields = document.querySelector("#lead-fields");
const thanksEl = document.querySelector("#thanks");
const thanksCopy = document.querySelector("#thanks-copy");
const errorEl = document.querySelector("#form-error");
const submitButton = document.querySelector("#submit");

const DISCLAIMER =
  "This is an estimate, not a bid. The price can change after a site visit, a check of the measurements, and the material you choose. Walls over about 4 ft, or walls with a driveway, slope, or structure above them, may need a permit and an engineered design.";

let requestId = 0;
let latestQuote = null;

function money(amount) {
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function range(low, high) {
  const left = money(low);
  const right = money(high);
  return left === right ? left : `${left}–${right}`;
}

function selected(name) {
  const input = form.querySelector(`input[name="${name}"]:checked`);
  return input ? input.value : "";
}

function payload() {
  return {
    project: selected("project"),
    pavers: {
      areaSf: form.areaSf.value,
      shape: selected("shape"),
      access: selected("access"),
    },
    wall: {
      lengthFt: form.lengthFt.value,
      heightFt: form.heightFt.value,
    },
    name: form.name.value,
    phone: form.phone.value,
    email: form.email.value,
    city: form.city.value,
  };
}

function showError(message) {
  errorEl.hidden = !message;
  errorEl.textContent = message || "";
}

function setProjectPanels() {
  const project = selected("project");
  paverFields.hidden = project !== "pavers" && project !== "both";
  wallFields.hidden = project !== "wall" && project !== "both";
  if (!project) {
    priceEl.hidden = true;
    leadFields.hidden = true;
    latestQuote = null;
  }
}

function renderQuote(quote) {
  priceEl.replaceChildren();
  if (!quote || !quote.sections.length) {
    priceEl.hidden = true;
    leadFields.hidden = true;
    latestQuote = null;
    return;
  }

  latestQuote = quote;
  for (const item of quote.sections) {
    const card = document.createElement("article");
    card.className = "price-card";
    const title = document.createElement("h2");
    title.textContent = item.title;
    const qty = document.createElement("p");
    qty.className = "qty";
    qty.textContent = item.quantityLabel;
    const total = document.createElement("p");
    total.className = "total";
    total.textContent = range(item.lowTotal, item.highTotal);
    const unit = document.createElement("p");
    unit.className = "unit";
    unit.textContent = `${range(item.lowPer, item.highPer)} ${item.perLabel}`;
    card.append(title, qty, total, unit);
    priceEl.append(card);
  }

  if (quote.combined) {
    const combined = document.createElement("div");
    combined.className = "combined";
    const title = document.createElement("h2");
    title.textContent = "Project total";
    const total = document.createElement("p");
    total.className = "total";
    total.textContent = range(quote.combined.lowTotal, quote.combined.highTotal);
    combined.append(title, total);
    priceEl.append(combined);
  }

  const note = document.createElement("p");
  note.className = "disclaimer";
  note.textContent = DISCLAIMER;
  priceEl.append(note);
  priceEl.hidden = false;
  if (thanksEl.hidden) leadFields.hidden = false;
}

async function refreshQuote() {
  setProjectPanels();
  const project = selected("project");
  if (!project) return;

  const id = ++requestId;
  let response;
  try {
    response = await fetch("/api/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload()),
    });
  } catch {
    if (id !== requestId) return;
    showError("The estimate couldn’t be reached. Try again.");
    return;
  }
  if (id !== requestId) return;

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    showError(body.error || "Check the measurements and try again.");
    priceEl.hidden = true;
    leadFields.hidden = true;
    latestQuote = null;
    return;
  }
  showError("");
  renderQuote(body.quote);
}

form.addEventListener("input", (event) => {
  if (event.target.closest("#lead-fields")) return;
  refreshQuote();
});

form.addEventListener("change", (event) => {
  if (event.target.closest("#lead-fields")) return;
  refreshQuote();
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!latestQuote) {
    showError("Enter your measurements to see a price first.");
    return;
  }
  showError("");
  submitButton.disabled = true;
  try {
    const response = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload()),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      showError(body.error || "The estimate couldn’t be saved. Try again.");
      submitButton.disabled = false;
      return;
    }
    renderQuote(body.quote);
    const name = form.name.value.trim();
    thanksCopy.textContent = name
      ? `Thanks, ${name}. We saved the range shown above and will be in touch.`
      : "Thanks. We saved the range shown above and will be in touch.";
    for (const el of form.elements) {
      if (el.id !== "another") el.disabled = true;
    }
    leadFields.hidden = true;
    thanksEl.hidden = false;
  } catch {
    showError("The estimate couldn’t be saved. Try again.");
    submitButton.disabled = false;
  }
});

document.querySelector("#another").addEventListener("click", () => {
  window.location.reload();
});
