"use strict";

// The prospect sees one installed rate from the size slide, plus the total.
// A taller wall adds a flat amount on top of that rate. Neither the adder
// nor any cost stack is included in the public quote.

const PAVER_SLIDE = { smallQty: 200, smallRate: 35, largeQty: 1000, largeRate: 25 };
const WALL_SLIDE = { smallQty: 50, smallRate: 100, largeQty: 400, largeRate: 80 };
const GEOGRID_ADDER = 3;
const BURIED_FT = 0.5;
const GEOGRID_TRIGGER_FT = 3.5;

const SHAPES = {
  straight: "Straight",
  "some-cuts": "Some cuts",
  curved: "Curved and detailed",
};

const ACCESS = {
  easy: "Easy",
  moderate: "Moderate",
  tight: "Tight",
};

const LIMITS = {
  areaSf: 20000,
  lengthFt: 500,
  heightFt: 20,
};

function formatQuantity(n) {
  const rounded = Math.round(n * 10) / 10;
  if (Math.abs(rounded - Math.round(rounded)) < 1e-9) {
    return Math.round(rounded).toLocaleString("en-US");
  }
  return rounded.toLocaleString("en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

function readNumber(value) {
  if (value === undefined || value === null || value === "") return { empty: true };
  const n = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(n)) return { invalid: true };
  return { value: n };
}

function positive(parsed, max, emptyMessage, invalidMessage, rangeMessage) {
  if (parsed.empty) return { empty: true, error: emptyMessage };
  if (parsed.invalid || parsed.value <= 0) return { error: invalidMessage };
  if (parsed.value > max) return { error: rangeMessage };
  return { value: parsed.value };
}

// Straight line from the small-job rate to the large-job rate, in cents.
function slideCents(quantity, slide) {
  if (quantity <= slide.smallQty) return slide.smallRate * 100;
  if (quantity >= slide.largeQty) return slide.largeRate * 100;
  const span = slide.largeQty - slide.smallQty;
  const deltaCents = (slide.largeRate - slide.smallRate) * 100;
  const exact = slide.smallRate * 100 + (deltaCents * (quantity - slide.smallQty)) / span;
  return Math.round(exact);
}

function dollars(cents) {
  return cents / 100;
}

function totalDollars(rateCents, quantity) {
  return Math.round(rateCents * quantity) / 100;
}

function section(id, title, quantityLabel, perLabel, rateCents, quantity) {
  return {
    id,
    title,
    quantityLabel,
    perLabel,
    rate: dollars(rateCents),
    total: totalDollars(rateCents, quantity),
  };
}

function emptyResult() {
  return {
    ok: true,
    complete: false,
    publicQuote: { sections: [], combined: null },
    privateNotes: [],
    inputs: { project: null, pavers: null, wall: null },
    internal: { paver: null, wall: null },
  };
}

function fail(error) {
  return { ok: false, error };
}

function estimate(input, { strict = false } = {}) {
  const body = input && typeof input === "object" ? input : {};
  const project = body.project;
  if (!project) return emptyResult();
  if (project !== "pavers" && project !== "wall" && project !== "both") {
    return fail("Choose a paver patio, a retaining wall, or both.");
  }

  const wantPavers = project === "pavers" || project === "both";
  const wantWall = project === "wall" || project === "both";
  const sections = [];
  const notes = [];
  const internal = { paver: null, wall: null };
  const inputs = { project, pavers: null, wall: null };
  let missing = false;

  if (wantPavers) {
    const pavers = body.pavers && typeof body.pavers === "object" ? body.pavers : {};
    const area = positive(
      readNumber(pavers.areaSf),
      LIMITS.areaSf,
      "Enter the paver area in square feet.",
      "Enter the paver area in square feet.",
      "Enter a paver area up to 20,000 square feet."
    );
    const shape = SHAPES[pavers.shape] ? pavers.shape : "";
    const access = ACCESS[pavers.access] ? pavers.access : "";

    if (area.error && !area.empty) return fail(area.error);
    if (area.empty || !shape || !access) {
      missing = true;
      if (strict) {
        if (area.empty || area.error) return fail(area.error || "Enter the paver area in square feet.");
        if (!shape) return fail("Choose the patio shape.");
        return fail("Choose how easy the access is.");
      }
    } else {
      const areaSf = area.value;
      const rateCents = slideCents(areaSf, PAVER_SLIDE);
      inputs.pavers = {
        areaSf,
        shape,
        shapeLabel: SHAPES[shape],
        access,
        accessLabel: ACCESS[access],
      };
      internal.paver = { rate: dollars(rateCents) };
      sections.push(
        section("pavers", "Paver patio", `${formatQuantity(areaSf)} sq ft`, "per sq ft", rateCents, areaSf)
      );
    }
  }

  if (wantWall) {
    const wall = body.wall && typeof body.wall === "object" ? body.wall : {};
    const length = positive(
      readNumber(wall.lengthFt),
      LIMITS.lengthFt,
      "Enter the wall length in feet.",
      "Enter the wall length in feet.",
      "Enter a wall length up to 500 feet."
    );
    const height = positive(
      readNumber(wall.heightFt),
      LIMITS.heightFt,
      "Enter the visible wall height in feet.",
      "Enter the visible wall height in feet.",
      "Enter a visible height up to 20 feet."
    );
    if (length.error && !length.empty) return fail(length.error);
    if (height.error && !height.empty) return fail(height.error);
    if (length.empty || height.empty) {
      missing = true;
      if (strict) return fail(length.empty ? length.error : height.error);
    } else {
      const faceSf = length.value * height.value;
      const totalFt = height.value + BURIED_FT;
      const geogrid = totalFt > GEOGRID_TRIGGER_FT;
      const sizeCents = slideCents(faceSf, WALL_SLIDE);
      const rateCents = sizeCents + (geogrid ? GEOGRID_ADDER * 100 : 0);
      inputs.wall = { lengthFt: length.value, heightFt: height.value, faceSf };
      internal.wall = {
        faceSf,
        totalHeightFt: totalFt,
        geogrid,
        sizeRate: dollars(sizeCents),
        rate: dollars(rateCents),
      };
      if (geogrid) notes.push("Taller-wall price is included.");
      sections.push(
        section(
          "wall",
          "Retaining wall",
          `${formatQuantity(faceSf)} face sq ft`,
          "per face sq ft",
          rateCents,
          faceSf
        )
      );
    }
  }

  let combined = null;
  if (sections.length > 1) {
    const totalCents = Math.round(sections.reduce((sum, item) => sum + item.total * 100, 0));
    combined = { total: totalCents / 100 };
  }

  return {
    ok: true,
    complete: !missing && sections.length > 0,
    publicQuote: { sections, combined },
    privateNotes: notes,
    inputs,
    internal,
  };
}

module.exports = { estimate, PAVER_SLIDE, WALL_SLIDE, GEOGRID_ADDER };
