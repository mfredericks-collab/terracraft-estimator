"use strict";

// Customer ranges are the only numbers the public page is allowed to show.
// Confirmed internal rates and the placeholder cost stack live in this file
// so a small wall can lift its own floor. Nothing here is sent to the browser.

const PAVER_LOW = 25;
const PAVER_HIGH = 35;
const WALL_LOW = 54;
const WALL_HIGH = 75;

const RATES = {
  paverMaterial: 8,
  paverLabor: 6,
  wallMaterial: 16,
  wallLabor: 14,
  geogridAdder: 3,
};

const BURIED_FT = 0.5;
const GEOGRID_TRIGGER_FT = 3.5;

const TAX_RATE = 0.07;
const CONTINGENCY = 0.05;
const OVERHEAD = 0.15;

const SKID_PER_DAY = 350;
const COMPACTOR_PER_DAY = 100;
const SAW = 90;
const BLADE = 40;
const DELIVERY = 125;
const DISPOSAL_PER_CY = 40;
const TONS_PER_LOAD = 12;

const CREW_SIZE = 3;
const HOURS_PER_DAY = 8;
const SETUP_MH = 6;
const EXCAV_MH_PER_CY = 0.75;
const BASE_MH_PER_TON = 1;
const FIRST_COURSE_LF_PER_MH = 10;
const UPPER_FACE_SF_PER_MH = 12;
const DRAIN_MH_PER_TON = 0.5;
const BACKFILL_MH_PER_CY = 0.5;
const GRID_SF_PER_MH = 200;
const PIPE_LF_PER_MH = 40;
const FABRIC_SF_PER_MH = 500;
const CAP_LF_PER_MH = 20;
const CORNER_MH = 1.5;
const SOIL_REUSE = 0.7;
const ENDS = 2;

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

function roundUpTo(value, increment) {
  if (!(value > 0)) return 0;
  const steps = Math.ceil(value / increment - 1e-9);
  return steps * increment;
}

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

function moneyTotal(perUnit, quantity) {
  return Math.round(perUnit * quantity);
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

// Quick-mode wall cost. Equipment, trucking, tax, contingency, and overhead
// are still the estimating-model placeholders. Buried depth is one 6-inch
// course. Machine days round up to a full day so the published 40 ft × 3.5 ft
// sample (about $57 per face sq ft) keeps the floor the customer sees at $58.
function wallInternals(lengthFt, exposedFt) {
  const totalFt = exposedFt + BURIED_FT;
  const faceSf = lengthFt * exposedFt;
  const geogrid = totalFt > GEOGRID_TRIGGER_FT;

  const courses = Math.ceil((totalFt * 12) / 6 - 1e-9);
  const blocksPerCourse = Math.ceil((lengthFt * 12) / 16 - 1e-9);
  const baseDepthIn = 6 + Math.max(0, totalFt - 4);
  const trenchWidthFt = 2;
  const baseTonsRaw = (lengthFt * trenchWidthFt * (baseDepthIn / 12)) / 27 * 1.2 * 1.4;
  const trenchCy = (lengthFt * trenchWidthFt * (baseDepthIn / 12 + BURIED_FT)) / 27;

  const gridLengthFt = Math.max(4, 0.6 * totalFt);
  const layers = Math.floor((courses - 1) / 2);
  const gridSf = geogrid ? lengthFt * gridLengthFt * layers * 1.05 : 0;
  const backCutWidthFt = geogrid ? gridLengthFt + 1 : 2;
  const backCutCy = (lengthFt * totalFt * backCutWidthFt * 0.5) / 27;

  const excavationCy = trenchCy + backCutCy;
  const haulCy = (trenchCy + backCutCy * (1 - SOIL_REUSE)) * 1.25;
  const backfillCy = backCutCy * SOIL_REUSE;

  const blockCount = courses * blocksPerCourse;
  const drainTonsRaw = ((lengthFt * (totalFt - 0.5) + blockCount * 0.25) / 27) * 1.1 * 1.4;
  const baseTons = roundUpTo(baseTonsRaw, 0.5);
  const drainTons = roundUpTo(drainTonsRaw, 0.5);

  const outlets = Math.max(1, Math.ceil(lengthFt / 30 - 1e-9));
  const pipeLf = lengthFt + outlets * 10;
  const fabricSf = lengthFt * (totalFt + 2) * 1.1;
  const upperFaceSf = lengthFt * (totalFt - 0.5);

  const manHours =
    SETUP_MH +
    excavationCy * EXCAV_MH_PER_CY +
    baseTons * BASE_MH_PER_TON +
    lengthFt / FIRST_COURSE_LF_PER_MH +
    upperFaceSf / UPPER_FACE_SF_PER_MH +
    drainTons * DRAIN_MH_PER_TON +
    backfillCy * BACKFILL_MH_PER_CY +
    gridSf / GRID_SF_PER_MH +
    pipeLf / PIPE_LF_PER_MH +
    fabricSf / FABRIC_SF_PER_MH +
    lengthFt / CAP_LF_PER_MH +
    ENDS * CORNER_MH;

  const jobDays = roundUpTo(manHours / (CREW_SIZE * HOURS_PER_DAY), 0.5);
  const machineDays = Math.max(1, Math.ceil(excavationCy / 15 - 1e-9));

  const materialCost = faceSf * RATES.wallMaterial;
  const laborCost = faceSf * RATES.wallLabor;
  const gridCost = geogrid ? faceSf * RATES.geogridAdder : 0;
  const tax = (materialCost + gridCost) * TAX_RATE;
  const equipment = machineDays * SKID_PER_DAY + jobDays * COMPACTOR_PER_DAY + SAW + BLADE;
  const loads = Math.ceil((baseTons + drainTons) / TONS_PER_LOAD - 1e-9) + 1;
  const trucking = loads * DELIVERY + haulCy * DISPOSAL_PER_CY;
  const directCost = materialCost + laborCost + gridCost + tax + equipment + trucking;
  const breakEven = directCost * (1 + CONTINGENCY) * (1 + OVERHEAD);

  return {
    faceSf,
    totalFt,
    geogrid,
    breakEven,
    breakEvenPer: breakEven / faceSf,
    directCost,
    machineDays,
    jobDays,
    manHours,
  };
}

function applyWallFloor(internals) {
  const adder = internals.geogrid ? RATES.geogridAdder : 0;
  const goalLow = WALL_LOW + adder;
  const goalHigh = WALL_HIGH + adder;
  const breakEvenPer = Math.round(internals.breakEvenPer * 100) / 100;
  let lowPer = goalLow;
  let highPer = goalHigh;
  let floorRaised = false;
  let floorAboveGoal = false;

  if (breakEvenPer > goalLow) {
    floorRaised = true;
    lowPer = Math.ceil(breakEvenPer - 1e-9);
    if (lowPer > goalHigh) {
      // A top below the floor would publish a number under break-even.
      // The goal top stays in the note; the page shows the raised floor.
      floorAboveGoal = true;
      highPer = lowPer;
    }
  }

  return { lowPer, highPer, goalLow, goalHigh, breakEvenPer, floorRaised, floorAboveGoal };
}

function wallNotes(priced) {
  const notes = [];
  if (priced.geogrid) notes.push("Taller-wall price is included.");
  if (priced.floorRaised) {
    let note = `Usual floor was raised on this wall. Break-even is $${priced.breakEvenPer.toFixed(2)} per face sq ft.`;
    if (priced.floorAboveGoal) {
      note += " The usual top of the range is below that floor, so the price shown is the raised floor.";
    }
    notes.push(note);
  }
  return notes;
}

function section(id, title, quantityLabel, perLabel, lowPer, highPer, quantity) {
  return {
    id,
    title,
    quantityLabel,
    perLabel,
    lowPer,
    highPer,
    lowTotal: moneyTotal(lowPer, quantity),
    highTotal: moneyTotal(highPer, quantity),
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
      inputs.pavers = {
        areaSf,
        shape,
        shapeLabel: SHAPES[shape],
        access,
        accessLabel: ACCESS[access],
      };
      internal.paver = {
        materialCost: areaSf * RATES.paverMaterial,
        laborCost: areaSf * RATES.paverLabor,
      };
      sections.push(
        section(
          "pavers",
          "Paver patio",
          `${formatQuantity(areaSf)} sq ft`,
          "per sq ft",
          PAVER_LOW,
          PAVER_HIGH,
          areaSf
        )
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
      const built = wallInternals(length.value, height.value);
      const priced = applyWallFloor(built);
      inputs.wall = {
        lengthFt: length.value,
        heightFt: height.value,
        faceSf: built.faceSf,
      };
      internal.wall = {
        breakEven: built.breakEven,
        breakEvenPer: priced.breakEvenPer,
        geogrid: built.geogrid,
        totalHeightFt: built.totalFt,
        faceSf: built.faceSf,
        machineDays: built.machineDays,
        jobDays: built.jobDays,
        directCost: built.directCost,
        floorRaised: priced.floorRaised,
        floorAboveGoal: priced.floorAboveGoal,
      };
      notes.push(...wallNotes({ ...built, ...priced }));
      sections.push(
        section(
          "wall",
          "Retaining wall",
          `${formatQuantity(built.faceSf)} face sq ft`,
          "per face sq ft",
          priced.lowPer,
          priced.highPer,
          built.faceSf
        )
      );
    }
  }

  let combined = null;
  if (sections.length > 1) {
    combined = {
      lowTotal: sections.reduce((sum, item) => sum + item.lowTotal, 0),
      highTotal: sections.reduce((sum, item) => sum + item.highTotal, 0),
    };
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

module.exports = {
  estimate,
  RATES,
  PAVER_LOW,
  PAVER_HIGH,
  WALL_LOW,
  WALL_HIGH,
};
