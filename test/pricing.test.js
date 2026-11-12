"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { estimate, RATES } = require("../lib/pricing");

function quote(input) {
  const result = estimate(input, { strict: true });
  assert.equal(result.ok, true, result.error);
  assert.equal(result.complete, true);
  return result;
}

function wallSection(result) {
  return result.publicQuote.sections.find((section) => section.id === "wall");
}

test("confirmed rates stay on the internal paver cost", () => {
  const result = quote({
    project: "pavers",
    pavers: { areaSf: 400, shape: "some-cuts", access: "moderate" },
  });
  assert.equal(RATES.paverMaterial, 8);
  assert.equal(RATES.paverLabor, 6);
  assert.equal(result.internal.paver.materialCost, 3200);
  assert.equal(result.internal.paver.laborCost, 2400);
  const section = result.publicQuote.sections[0];
  assert.deepEqual(
    [section.lowPer, section.highPer, section.lowTotal, section.highTotal],
    [25, 35, 10000, 14000]
  );
  assert.equal(section.quantityLabel, "400 sq ft");
});

test("shape and access do not change the paver range", () => {
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

test("40 ft by 3.5 ft wall matches the sample floor", () => {
  const result = quote({
    project: "wall",
    wall: { lengthFt: 40, heightFt: 3.5 },
  });
  const section = wallSection(result);
  assert.equal(result.internal.wall.geogrid, true);
  assert.ok(
    Math.abs(result.internal.wall.breakEvenPer - 57.21) < 0.15,
    `break-even ${result.internal.wall.breakEvenPer}`
  );
  assert.equal(result.internal.wall.machineDays, 2);
  assert.equal(result.internal.wall.jobDays, 2.5);
  assert.equal(section.quantityLabel, "140 face sq ft");
  assert.deepEqual(
    [section.lowPer, section.highPer, section.lowTotal, section.highTotal],
    [58, 78, 8120, 10920]
  );
  assert.ok(result.privateNotes.some((note) => note.includes("Taller-wall price is included.")));
  assert.ok(result.privateNotes.some((note) => note.includes("Usual floor was raised")));
  assert.equal(JSON.stringify(result.publicQuote).includes("Break-even"), false);
  assert.equal(JSON.stringify(result.publicQuote).includes("57.2"), false);
});

test("a wall at 3 ft visible stays on the usual range", () => {
  const result = quote({
    project: "wall",
    wall: { lengthFt: 40, heightFt: 3 },
  });
  const section = wallSection(result);
  assert.equal(result.internal.wall.geogrid, false);
  assert.equal(result.internal.wall.floorRaised, false);
  assert.deepEqual([section.lowPer, section.highPer], [54, 75]);
  assert.deepEqual(result.privateNotes, []);
});

test("a modest small wall raises only the low end", () => {
  const result = quote({
    project: "wall",
    wall: { lengthFt: 20, heightFt: 2 },
  });
  const section = wallSection(result);
  assert.equal(result.internal.wall.geogrid, false);
  assert.equal(result.internal.wall.floorRaised, true);
  assert.equal(section.lowPer, 66);
  assert.equal(section.highPer, 75);
  assert.equal(section.lowTotal, 2640);
  assert.equal(section.highTotal, 3000);
  assert.equal(result.privateNotes.some((note) => /\$\d+\.\d\d per face sq ft/.test(note)), true);
  assert.equal(JSON.stringify(result.publicQuote).toLowerCase().includes("break-even"), false);
});

test("a very small wall does not quote under its floor", () => {
  const result = quote({
    project: "wall",
    wall: { lengthFt: 10, heightFt: 2 },
  });
  const section = wallSection(result);
  assert.equal(result.internal.wall.floorAboveGoal, true);
  assert.equal(section.lowPer, 91);
  assert.equal(section.highPer, 91);
  assert.equal(section.lowTotal, 1820);
  assert.equal(section.highTotal, 1820);
  assert.ok(result.privateNotes.some((note) => note.includes("raised floor")));
});

test("both parts keep separate ranges and a combined total", () => {
  const result = quote({
    project: "both",
    pavers: { areaSf: 400, shape: "straight", access: "easy" },
    wall: { lengthFt: 40, heightFt: 3.5 },
  });
  assert.equal(result.publicQuote.sections.length, 2);
  assert.equal(result.publicQuote.combined.lowTotal, 10000 + 8120);
  assert.equal(result.publicQuote.combined.highTotal, 14000 + 10920);
});

test("public quote objects do not carry internal rates", () => {
  const result = quote({
    project: "both",
    pavers: { areaSf: 250, shape: "straight", access: "easy" },
    wall: { lengthFt: 40, heightFt: 4 },
  });
  const json = JSON.stringify(result.publicQuote).toLowerCase();
  for (const word of ["geogrid", "break-even", "markup", "margin", "labor", "crew", "materialcost"]) {
    assert.equal(json.includes(word), false, word);
  }
  assert.equal(Object.hasOwn(result.publicQuote, "internal"), false);
  assert.equal(Object.hasOwn(result.publicQuote, "privateNotes"), false);
});
