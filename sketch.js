/* global loadJSON, createCanvas, windowWidth, windowHeight, pixelDensity, textFont, createGraphics */
/* global image, millis, noStroke, fill, width, height, push, pop, textSize, translate */
/* global textAlign, CENTER, text, rect, map, constrain, BOLD, NORMAL, textStyle, textWidth */


// Palette (use only these)
const PALETTE = {
  goldDark: "#B3A369",
  navy: "#003057",
  white: "#FFFFFF",
  cream: "#F9F6E5",
  gray: "#54585A",
  sage: "#D6DBD4",
  gold: "#EAAA00",
};

let buzzwordPairsRaw;
let buzzwordPairs = []; // [{a,b,a_count,b_count}, ...]

const TOTAL_MS = 60_000;
let startMs = 0;

let bg;
let lastDisplayIdx = -1;

// Cache placements per (label,total,box dims,canvas dims)
let scatterCache = new Map();

// Timing
const INTRO_PORTION = 0.075; // fraction of TOTAL_MS reserved for the intro title card
const slots = pairs.length * 2;
const seg = 1 / slots;


function hexToRgb(hex) {
  const h = hex.replace("#", "").trim();
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgb(hex) {
  const c = hexToRgb(hex);
  return [c.r, c.g, c.b];
}

function preload() {
  buzzwordPairsRaw = loadJSON("buzzword_pairs.json");
}

function setup() {
  createCanvas(windowWidth, windowHeight);
  pixelDensity(1);
  textFont("system-ui");

  buzzwordPairs = normalizeBuzzwordPairs(buzzwordPairsRaw);

  startMs = millis();
  bg = makeBackground(width, height);
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  bg = makeBackground(width, height);
  scatterCache = new Map();
}

function draw() {

  const tGlobal = (millis() - startMs) % TOTAL_MS;
  const introMs = TOTAL_MS * INTRO_PORTION;

  if (tGlobal < introMs) {
    const p = tGlobal / introMs;
  
    // Clear background during intro
    background(...rgb(PALETTE.goldDark));
  
    drawIntro(p);
    return;
  }

  if (!buzzwordPairs.length) {
    drawCenteredMessage(
      "Couldn’t load buzzword_pairs.json.\nRun from a local server.",
    );
    return;
  }

  const t = tGlobal - introMs;
  const remainingMs = TOTAL_MS - introMs;
  drawBuzzwordPairsSequence(t / remainingMs);
}

function normalizeContradictions(data) {
  if (!data || typeof data !== "object") return [];
  const pairs = Array.isArray(data.pairs) ? data.pairs : [];
  return pairs
    .map((p) => {
      if (!p || typeof p !== "object") return null;
      const a = typeof p.a === "string" ? p.a.trim() : "";
      const b = typeof p.b === "string" ? p.b.trim() : "";
      if (!a || !b) return null;
      return { a, b };
    })
    .filter(Boolean);
}

function normalizeBuzzwordPairs(data) {
  if (!data || typeof data !== "object") return [];
  const pairs = Array.isArray(data.pairs) ? data.pairs : [];
  return pairs
    .map((p) => {
      if (!p || typeof p !== "object") return null;
      const a = typeof p.a === "string" ? p.a.trim() : "";
      const b = typeof p.b === "string" ? p.b.trim() : "";
      const aCount = typeof p.a_count === "number" ? p.a_count : 0;
      const bCount = typeof p.b_count === "number" ? p.b_count : 0;
      if (!a || !b) return null;
      return { a, b, a_count: aCount, b_count: bCount };
    })
    .filter(Boolean);
}

function drawBuzzwordPairsSequence(p) {
  const pairs = buzzwordPairs;
  if (!pairs.length) return;

  // A is faster, B is slower
  const weightA = 1;
  const weightB = 1.6; // <-- B slower (increase to make even slower)

  const segments = [];

  for (let i = 0; i < pairs.length; i++) {
    segments.push({
      pairIdx: i,
      isB: false,
      weight: weightA,
    });
    segments.push({
      pairIdx: i,
      isB: true,
      weight: weightB,
    });
  }

  const totalWeight = segments.reduce((s, seg) => s + seg.weight, 0);

  let cumulative = 0;
  let activeSeg = null;

  for (let seg of segments) {
    const start = cumulative / totalWeight;
    cumulative += seg.weight;
    const end = cumulative / totalWeight;

    if (p >= start && p < end) {
      activeSeg = {
        ...seg,
        localP: (p - start) / (end - start),
      };
      break;
    }
  }

  if (!activeSeg) return;

  const pair = pairs[activeSeg.pairIdx];
  const word = (activeSeg.isB ? pair.b : pair.a).toUpperCase();
  const countRaw = activeSeg.isB ? pair.b_count : pair.a_count;
  const count = Math.max(1, Math.floor(countRaw || 0));

  //  Background swap 
  const bgColor = activeSeg.isB
    ? PALETTE.navy
    : PALETTE.goldDark;

  background(...rgb(bgColor));

  const a = Math.floor(255 * segmentAlpha(activeSeg.localP));

  drawCountScatterWordBuild(word, count, a, activeSeg.localP);
}

function drawCountScatterWordBuild(word, count, alpha255, tSeg) {
  // More-even spacing: grid cells + randomized fill order (still deterministic).
  const marginX = Math.max(22, width * 0.06);
  const marginTop = Math.max(88, height * 0.19);
  const marginBottom = Math.max(42, height * 0.16);
  const areaW = width - marginX * 2;
  const areaH = height - marginTop - marginBottom;

  const n = Math.max(1, count);
  const aspect = areaW / Math.max(1, areaH);
  let cols = Math.ceil(Math.sqrt(n * aspect));
  cols = Math.max(1, cols);
  let rows = Math.ceil(n / cols);
  rows = Math.max(1, rows);

  const cellW = areaW / cols;
  const cellH = areaH / rows;

  // Fit font inside a cell.
  let fs = Math.min(cellH * 0.62, 60);
  fs = Math.max(8, fs);

  push();
  textAlign(CENTER, CENTER);
  textStyle(BOLD);

  // Shrink if word would overflow the cell width.
  for (let attempt = 0; attempt < 10; attempt++) {
    textSize(fs);
    const wWord = textWidth(word);
    if (wWord <= cellW * 0.9) break;
    fs = Math.max(7, fs * 0.88);
  }

  // Deterministic shuffle over the *entire* grid so the right side gets used.
  const rand = mulberry32(hashStringFNV1a(`GRID:${word}`));
  const totalCells = rows * cols;
  const order = Array.from({ length: totalCells }, (_, i) => i);
  for (let i = totalCells - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = order[i];
    order[i] = order[j];
    order[j] = tmp;
  }

  // Build up one-by-one, then hold.
  const buildPortion = 0.78;
  const pBuild = tSeg <= 0 ? 0 : Math.min(1, tSeg / buildPortion);
  const buildN = pBuild * n;
  const fullShown = Math.min(n, Math.floor(buildN));
  const frac = buildN - fullShown;
  const shown = Math.min(n, fullShown + (frac > 0.00001 ? 1 : 0));
  const newestAlpha = easeInOutCubic(frac);

  noStroke();
  textSize(fs);

  for (let k = 0; k < shown; k++) {
    const cellIdx = order[k];
    const c = cellIdx % cols;
    const r = Math.floor(cellIdx / cols);
    const cx = marginX + c * cellW + cellW / 2;
    const cy = marginTop + r * cellH + cellH / 2;

    // Slight scatter within the cell so rows don't align perfectly.
    const jitterRand = mulberry32(hashStringFNV1a(`${word}:${cellIdx}`));
    const jx = (jitterRand() - 0.5) * cellW * 0.22;
    const jy = (jitterRand() - 0.5) * cellH * 0.38;
    const x = cx + jx;
    const y = cy + jy;

    const isNewest = k === shown - 1 && frac > 0.00001;
    const a = isNewest
      ? Math.floor(alpha255 * newestAlpha)
      : Math.floor(alpha255 * 0.92);

    fill(...rgb(PALETTE.white), a);
    text(word, x, y);
  }

  // Top caption with total count.
  textStyle(NORMAL);
  textSize(24);
  fill(...rgb(PALETTE.white), Math.floor(alpha255 * 0.95));
  textAlign(CENTER, CENTER);
  // Simulate a "medium" weight (bolder than NORMAL, lighter than BOLD).
  const cap = `${n} TIMES IN GT STRATEGIC PLAN`;
  text(cap, width / 2, 54);
  text(cap, width / 2 + 0.7, 54);

  pop();
}

function drawContradictions(p) {
  // Each pair: show A then B back-to-back.
  const n = contradictions.length;
  if (!n) return;

  const seg = 1 / n;
  const idx = Math.min(n - 1, Math.floor(p / seg));
  const tPair = (p - idx * seg) / seg; // 0..1 within pair

  const half = 0.5;
  const showingB = tPair >= half;
  const tWord = showingB ? (tPair - half) / half : tPair / half;

  const word = showingB ? contradictions[idx].b : contradictions[idx].a;
  const a = Math.floor(255 * segmentAlpha(tWord));

  push();
  textAlign(CENTER, CENTER);
  textStyle(BOLD);
  textSize(constrain(Math.min(width, height) * 0.14, 34, 110));

  // Alternate color for punch.
  const col = showingB ? PALETTE.navy : PALETTE.white;
  fill(...rgb(col), a);
  text(word, width / 2, height / 2);
  pop();
}

function normalizeValues(data) {
  if (!data || typeof data !== "object")
    return { canonical: [], sequence: [], occurrences: [] };
  const canon = Array.isArray(data.canonical) ? data.canonical : [];
  const seq = Array.isArray(data.sequence) ? data.sequence : [];
  const occ = Array.isArray(data.occurrences) ? data.occurrences : [];

  const canonicalClean = canon
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter(Boolean);
  const canonicalSet = new Set(canonicalClean);

  const sequenceClean = seq
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter((s) => canonicalSet.has(s));

  const occurrencesClean = occ
    .map((o) => {
      if (!o || typeof o !== "object") return null;
      const label = typeof o.label === "string" ? o.label.trim() : "";
      const next = typeof o.next === "string" ? o.next.trim() : "";
      if (!label || !canonicalSet.has(label)) return null;
      return { label, next };
    })
    .filter(Boolean);

  return {
    canonical: canonicalClean,
    sequence: sequenceClean,
    occurrences: occurrencesClean,
  };
}

function buildDisplayOrderCountsAndNext(occurrencesArr, seqFallback) {
  const counts = new Map();
  const nextBy = new Map();

  const hasOcc = Array.isArray(occurrencesArr) && occurrencesArr.length > 0;
  if (hasOcc) {
    for (const o of occurrencesArr) {
      const label = o.label;
      counts.set(label, (counts.get(label) ?? 0) + 1);
      const arr = nextBy.get(label) ?? [];
      arr.push(o.next || "");
      nextBy.set(label, arr);
    }
  } else {
    for (const label of seqFallback)
      counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  const seen = new Set();
  const order = [];
  const seq = hasOcc ? occurrencesArr.map((o) => o.label) : seqFallback;
  for (const label of seq) {
    if (seen.has(label)) continue;
    seen.add(label);
    order.push(label);
  }

  return {
    displayOrder: order,
    countsByLabel: counts,
    nextWordsByLabel: nextBy,
  };
}

function makeBackground(w, h) {
  const g = createGraphics(w, h);
  g.noStroke();

  // Solid gold field.
  g.fill(...rgb(PALETTE.goldDark));
  g.rect(0, 0, w, h);

  // Palette-only grain.
  for (let i = 0; i < Math.floor((w * h) / 6500); i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const a = 10 + Math.random() * 18;
    g.fill(...rgb(Math.random() < 0.5 ? PALETTE.cream : PALETTE.white), a);
    g.rect(x, y, 1, 1);
  }

  return g;
}

function segmentAlpha(p) {
  // Fade-in only (no fade-out).
  const inEnd = 0.18;
  if (p < inEnd) return easeInOutCubic(p / inEnd);
  return 1;
}

function easeInOutCubic(x) {
  const t = constrain(x, 0, 1);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function drawCenteredMessage(msg) {
  push();
  textAlign(CENTER, CENTER);
  textSize(constrain(Math.min(width, height) * 0.045, 16, 28));
  fill(...rgb(PALETTE.white), 200);
  text(msg, width / 2, height / 2);
  pop();
}

function drawIntro(p) {
  const a = Math.floor(255 * segmentAlpha(p));

  // Lines (left-aligned) as requested.
  const lines = [
    ["BUZZWORDS"],
    ["FROM", "THE"],
    ["GEORGIA", "TECH"],
    ["STRATEGIC", "PLAN"],
  ];

  const marginX = width * 0.12;
  const blockW = width * 0.78;

  const fs = constrain(Math.min(width, height) * 0.085, 22, 58);
  const lineH = fs * 1.22;
  const blockH = lineH * lines.length;
  const startY = height / 2 - blockH / 2 + lineH / 2;

  // Word-by-word slide-in from the right.
  // 7 words total -> stagger them across the intro.
  const totalWords = lines.reduce((sum, l) => sum + l.length, 0);
  const slideDur = 0.28; // fraction of intro per word slide
  const stagger = (1 - slideDur) / Math.max(1, totalWords - 1);

  push();
  textAlign(LEFT, CENTER);
  textStyle(BOLD);
  textSize(fs);
  fill(...rgb(PALETTE.white), a);

  let wordIdx = 0;
  for (let li = 0; li < lines.length; li++) {
    const y = startY + li * lineH;

    // Pre-compute target x positions for this line.
    const words = lines[li];
    const widths = words.map((w) => textWidth(w));
    const space = textWidth(" ");

    // Use a consistent gap so left alignment is clean.
    const gap = Math.max(space, fs * 0.35);

    let xCursor = marginX;
    for (let wi = 0; wi < words.length; wi++) {
      const w = words[wi];
      const wW = widths[wi];

      const t0 = wordIdx * stagger;
      const t1 = t0 + slideDur;
      const t = constrain((p - t0) / Math.max(0.0001, slideDur), 0, 1);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic

      // Start closer (around mid-screen), not from off-screen right.
      const xFrom = width * 0.52;
      const xTo = xCursor;
      const x = xFrom + (xTo - xFrom) * eased;
      const alphaWord = Math.floor(a * eased);

      fill(...rgb(PALETTE.white), alphaWord);
      text(w, x, y);

      xCursor += wW + gap;
      wordIdx++;
    }
  }

  pop();
}

function drawBuzzwordTransition(k, alpha01, p) {
  const a = Math.floor(255 * alpha01 * segmentAlpha(p));

  const msg = `BUZZWORD\n#${k}`;
  const x = width / 2;
  const y = height / 2;

  push();
  textAlign(CENTER, CENTER);
  textStyle(BOLD);
  textSize(constrain(Math.min(width, height) * 0.11, 28, 52));

  // Main
  fill(...rgb(PALETTE.white), a);
  text(msg, x, y);

  pop();
}

function hashStringFNV1a(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rectsOverlapSameSize(x1, y1, x2, y2, w, h) {
  return Math.abs(x1 - x2) < w && Math.abs(y1 - y2) < h;
}

function getNonOverlappingScatterPositions(
  label,
  total,
  marginX,
  marginTop,
  areaW,
  areaH,
  boxW,
  boxH,
) {
  const key = `${label}|${total}|${Math.floor(areaW)}|${Math.floor(areaH)}|${Math.floor(boxW)}|${Math.floor(boxH)}|${Math.floor(marginX)}|${Math.floor(marginTop)}`;
  const cached = scatterCache.get(key);
  if (cached) return cached;

  const seed =
    (hashStringFNV1a(label) ^
      (Math.floor(width) * 374761393) ^
      (Math.floor(height) * 668265263)) >>>
    0;
  const rand = mulberry32(seed);

  const maxX = Math.max(0, areaW - boxW);
  const maxY = Math.max(0, areaH - boxH);
  const placed = [];

  const attemptsPerItem = 1400;
  for (let i = 0; i < total; i++) {
    let ok = false;
    for (let a = 0; a < attemptsPerItem; a++) {
      const x = marginX + boxW / 2 + rand() * maxX;
      const y = marginTop + boxH / 2 + rand() * maxY;

      let collides = false;
      for (let j = 0; j < placed.length; j++) {
        const p = placed[j];
        if (rectsOverlapSameSize(x, y, p.x, p.y, boxW, boxH)) {
          collides = true;
          break;
        }
      }

      if (!collides) {
        placed.push({ x, y });
        ok = true;
        break;
      }
    }

    if (!ok) {
      scatterCache.set(key, null);
      return null;
    }
  }

  scatterCache.set(key, placed);
  return placed;
}

function drawActiveWord(label, alpha01, tSeg) {
  if (!label) return;

  const count = countsByLabel.get(label) ?? 1;
  const word = label.toUpperCase();
  const nextWordsRaw = nextWordsByLabel.get(label) ?? [];
  const total = Math.max(1, count);

  // Build (accumulate) most of the segment, then hold.
  const buildPortion = 0.78;
  const pBuild = tSeg <= 0 ? 0 : Math.min(1, tSeg / buildPortion);
  const buildN = pBuild * total;
  const fullShown = Math.min(total, Math.floor(buildN));
  const frac = buildN - fullShown;
  const shown = Math.min(total, fullShown + (frac > 0.00001 ? 1 : 0));

  const newestAlpha = easeInOutCubic(frac);
  const globalA = Math.floor(255 * alpha01);

  const marginX = Math.max(22, width * 0.06);
  const marginTop = Math.max(20, height * 0.1);
  const marginBottom = Math.max(30, height * 0.1);
  const areaW = width - marginX * 2;
  const areaH = height - marginTop - marginBottom;

  // Compute font size from available area.
  const areaPer = (areaW * areaH) / total;
  const cellSide = Math.sqrt(Math.max(1, areaPer));
  let fs = constrain(cellSide * 0.38, 10, 40);

  let wWord = 0;
  let maxNextW = 0;
  let boxW = 0;
  let boxH = 0;
  let pts = null;

  for (let attempt = 0; attempt < 10; attempt++) {
    textSize(fs);
    wWord = textWidth(word);

    // Measure next-word max width at smaller size.
    maxNextW = 0;
    push();
    textStyle(NORMAL);
    textSize(fs * 0.55);
    for (let i = 0; i < nextWordsRaw.length; i++) {
      const nw = (nextWordsRaw[i] || "").toUpperCase();
      if (!nw) continue;
      maxNextW = Math.max(maxNextW, textWidth(nw));
    }
    pop();

    // Approx bounding box for overlap (two lines: buzzword + next word).
    const wMax = Math.max(wWord, maxNextW);
    boxW = Math.max(wMax + 18, 54);
    boxH = Math.max(fs * 1.0 + fs * 0.55 * 1.05 + 10, 30);

    pts = getNonOverlappingScatterPositions(
      label,
      total,
      marginX,
      marginTop,
      areaW,
      areaH,
      boxW,
      boxH,
    );
    if (pts) break;
    fs = Math.max(9, fs * 0.9);
  }

  if (!pts) pts = [{ x: width / 2, y: height / 2 }];

  push();
  textAlign(CENTER, CENTER);
  textStyle(BOLD);
  textSize(fs);
  noStroke();

  for (let i = 0; i < shown; i++) {
    const p = pts[i % pts.length];
    const x = p.x;
    const y = p.y;

    const isNewest = i === shown - 1 && shown <= total && frac > 0.00001;
    const a = isNewest
      ? Math.floor(globalA * newestAlpha)
      : Math.floor(globalA * 0.92);

    const nextWord = (nextWordsRaw[i] || "").toUpperCase();
    const yMain = y - fs * 0.28;
    const yNext = y + fs * 0.48;

    if (isNewest) {
      // Impact flash (no zoom): shadow + cream + white.
      const flash = easeInOutCubic(constrain(frac * 1.4, 0, 1));

      fill(...rgb(PALETTE.navy), Math.floor(a * 0.35));
      text(word, x + 2, yMain + 2);

      fill(...rgb(PALETTE.cream), Math.floor(a * 0.35 * flash));
      text(word, x + 1, yMain + 1);
    }

    fill(...rgb(PALETTE.white), a);
    text(word, x, yMain);

    if (nextWord) {
      push();
      textStyle(NORMAL);
      textSize(fs * 0.55);
      fill(...rgb(PALETTE.white), Math.floor(a * 0.9));
      text(nextWord, x, yNext);
      pop();
    }
  }

  pop();
}
