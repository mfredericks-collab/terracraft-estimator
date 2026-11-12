"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { estimate } = require("../lib/pricing");

function quote(input) {
  const result = estimate(input, { strict: true });
  assert.equal(result.ok, true, result.error);
  assert.equal(result.complete, true);
  return result;
}

function wallSection(result) {
  return result.publicQuote.sections.find((section) => section.id === "wall");
}

function paverSection(result) {
  return result.publicQuote.sections.find((section) => section.id === "pavers");
}

test("paver rate slides from $35 to $25", () => {
  const small = paverSection(quote({
    project: "pavers",
    pavers: { areaSf: 200, shape: "straight", access: "easy" },
  }));
  assert.equal(small.rate, 35);
  assert.equal(small.total, 7000);

  const mid = paverSection(quote({
    project: "pavers",
    pavers: { areaSf: 600, shape: "straight", access: "easy" },
  }));
  assert.equal(mid.rate, 30);
  assert.equal(mid.total, 18000);

  const sample = paverSection(quote({
    project: "pavers",
    pavers: { areaSf: 400, shape: "some-cuts", access: "moderate" },
  }));
  assert.equal(sample.rate, 32.5);
  assert.equal(sample.total, 13000);
  assert.equal(sample.quantityLabel, "400 sq ft");

  const large = paverSection(quote({
    project: "pavers",
    pavers: { areaSf: 1000, shape: "straight", access: "easy" },
  }));
  assert.equal(large.rate, 25);
  assert.equal(large.total, 25000);

  const bigger = paverSection(quote({
    project: "pavers",
    pavers: { areaSf: 1500, shape: "straight", access: "easy" },
  }));
  assert.equal(bigger.rate, 25);
  assert.equal(bigger.total, 37500);
});

test("shape and access do not change the paver price", () => {
  const straight = quote({
    project: "pavers",
    pavers: { areaSf: 400, shape: "straight", access: "easy" },
  });
  const curved = quote({
    project: "pavers",
    pavers: { areaSf: 400, shape: "curved", access: "tight" },
  });
  assert.deepEqual(straight.publicQuote, curved.publicQuote);
  assert.equal(curved.inputs.pavers.shapeLabel, "Curved and detailed");
  assert.equal(curved.inputs.pavers.accessLabel, "Tight");
});

test("wall rate is $100 at 50 face sq ft and $80 at 400", () => {
  const small = wallSection(quote({
    project: "wall",
    wall: { lengthFt: 10, heightFt: 2 },
  }));
  assert.equal(small.quantityLabel, "20 face sq ft");
  assert.equal(small.rate, 100);
  assert.equal(small.total, 2000);

  const atFifty = wallSection(quote({
    project: "wall",
    wall: { lengthFt: 25, heightFt: 2 },
  }));
  assert.equal(atFifty.rate, 100);
  assert.equal(atFifty.total, 5000);

  const midpoint = wallSection(quote({
    project: "wall",
    wall: { lengthFt: 75, heightFt: 3 },
  }));
  assert.equal(midpoint.quantityLabel, "225 face sq ft");
  assert.equal(midpoint.rate, 90);
  assert.equal(midpoint.total, 20250);
  assert.equal(quote({
    project: "wall",
    wall: { lengthFt: 75, heightFt: 3 },
  }).privateNotes.length, 0);

  const large = wallSection(quote({
    project: "wall",
    wall: { lengthFt: 200, heightFt: 2 },
  }));
  assert.equal(large.quantityLabel, "400 face sq ft");
  assert.equal(large.rate, 80);
  assert.equal(large.total, 32000);
});

test("geogrid adds $3 on top of the size rate over 3.5 ft total height", () => {
  const under = quote({
    project: "wall",
    wall: { lengthFt: 40, heightFt: 3 },
  });
  assert.equal(under.internal.wall.geogrid, false);
  assert.equal(wallSection(under).rate, 96);
  assert.equal(wallSection(under).total, 11520);
  assert.deepEqual(under.privateNotes, []);

  const over = quote({
    project: "wall",
    wall: { lengthFt: 40, heightFt: 3.5 },
  });
  assert.equal(over.internal.wall.geogrid, true);
  assert.equal(over.internal.wall.sizeRate, 94.86);
  assert.equal(wallSection(over).rate, 97.86);
  assert.equal(wallSection(over).total, 13700.4);
  assert.deepEqual(over.privateNotes, ["Taller-wall price is included."]);

  const tallLarge = wallSection(quote({
    project: "wall",
    wall: { lengthFt: 100, heightFt: 4 },
  }));
  assert.equal(tallLarge.rate, 83);
  assert.equal(tallLarge.total, 33200);
});

test("both parts keep their own prices and a combined total", () => {
  const result = quote({
    project: "both",
    pavers: { areaSf: 400, shape: "straight", access: "easy" },
    wall: { lengthFt: 10, heightFt: 2 },
  });
  assert.equal(paverSection(result).total, 13000);
  assert.equal(wallSection(result).total, 2000);
  assert.equal(result.publicQuote.combined.total, 15000);
});

test("public quote objects do not carry internal pricing", () => {
  const result = quote({
    project: "both",
    pavers: { areaSf: 250, shape: "straight", access: "easy" },
    wall: { lengthFt: 40, heightFt: 4 },
  });
  const json = JSON.stringify(result.publicQuote).toLowerCase();
  for (const word of ["geogrid", "break-even", "breakeven", "markup", "margin", "labor", "crew", "material"]) {
    assert.equal(json.includes(word), false, word);
  }
  assert.equal(Object.hasOwn(result.publicQuote, "internal"), false);
  assert.equal(Object.hasOwn(result.publicQuote, "privateNotes"), false);
  assert.equal(JSON.stringify(result.privateNotes).toLowerCase().includes("break-even"), false);
});
