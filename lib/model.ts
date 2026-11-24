// northline-1 model: a robust comps fit of traded-token value on snapshot figures.
// Everything here is computed from the sealed snapshot at run time: no hardcoded
// coefficients, no hardcoded names. Node standard library only, erasable TypeScript.

export interface Proto {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl: number;
  change7d: number | null;
  mcap: number | null;
  listedAt: string | null;
  gecko: string | null;
  symbol: string | null;
}

export interface ModelCtx {
  bigCats: string[];
  medAge: number;
  medChange: number;
  asOfDays: number; // days since epoch of the snapshot's as_of date
  // Winsor bounds for the growth term, as fractions: the min/max 7-day change
  // the traded anchors actually span. A move outside is read at the edge,
  // never extrapolated — without this, a +4448% week would imply a value of
  // 10^-63 and a -73% week a 10x boost, both absurd.
  clipLo: number;
  clipHi: number;
}

export interface Validation {
  inMiss: number;
  inWithin3: number;
  cvMiss: number;
  cvWithin3: number;
  flatCvMiss: number;
  flatCvWithin3: number;
  blindMiss: number;
  blindWithin3: number;
  blindN: number;
  flatBlindMiss: number;
  flatBlindWithin3: number;
  walkMiss: number;
  walkWithin3: number;
  walkN: number;
  flatRatio: number;
  ablation: { term: string; blindMiss: number; blindWithin3: number; top20Kept: number }[];
}

export interface FitResult {
  coef: number[];
  ctx: ModelCtx;
  validation: Validation;
}

// ------------------------------------------------------------ small numerics

export function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  if (n === 0) return 0;
  return n % 2 === 1 ? s[(n - 1) / 2]! : (s[n / 2 - 1]! + s[n / 2]!) / 2;
}

function dot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i]! * b[i]!;
  return s;
}

/** Solve A x = b by Gaussian elimination with partial pivoting. A is n x n. */
export function solveLinear(aIn: number[][], bIn: number[]): number[] {
  const n = bIn.length;
  const a = aIn.map((row) => [...row]);
  const b = [...bIn];
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(a[r]![col]!) > Math.abs(a[piv]![col]!)!) piv = r;
    if (Math.abs(a[piv]![col]!) < 1e-12) throw new Error('solveLinear: singular matrix');
    if (piv !== col) {
      [a[col], a[piv]] = [a[piv]!, a[col]!];
      [b[col], b[piv]] = [b[piv]!, b[col]!];
    }
    for (let r = col + 1; r < n; r++) {
      const f = a[r]![col]! / a[col]![col]!;
      for (let c = col; c < n; c++) a[r]![c]! -= f * a[col]![c]!;
      b[r]! -= f * b[col]!;
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = b[r]!;
    for (let c = r + 1; c < n; c++) s -= a[r]![c]! * x[c]!;
    x[r] = s / a[r]![r]!;
  }
  return x;
}

function ols(X: number[][], y: number[]): number[] {
  const k = X[0]!.length;
  const ata: number[][] = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  const atb = new Array<number>(k).fill(0);
  for (let i = 0; i < X.length; i++) {
    for (let a = 0; a < k; a++) {
      atb[a]! += X[i]![a]! * y[i]!;
      for (let b = 0; b < k; b++) ata[a]![b]! += X[i]![a]! * X[i]![b]!;
    }
  }
  // Tiny ridge: a training subset (a CV fold, a bootstrap resample) can hold
  // no member of a category, leaving its one-hot column all zeros. The ridge
  // keeps the system solvable and that coefficient at 0 (pooled) instead.
  for (let j = 0; j < k; j++) ata[j]![j]! += 1e-8 * Math.max(1, ata[j]![j]!);
  return solveLinear(ata, atb);
}

function wls(X: number[][], y: number[], w: number[]): number[] {
  const k = X[0]!.length;
  const ata: number[][] = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  const atb = new Array<number>(k).fill(0);
  for (let i = 0; i < X.length; i++) {
    const wi = w[i]!;
    for (let a = 0; a < k; a++) {
      atb[a]! += wi * X[i]![a]! * y[i]!;
      for (let b = 0; b < k; b++) ata[a]![b]! += wi * X[i]![a]! * X[i]![b]!;
    }
  }
  for (let j = 0; j < k; j++) ata[j]![j]! += 1e-8 * Math.max(1, ata[j]![j]!);
  return solveLinear(ata, atb);
}

/** Huber robust fit by iteratively reweighted least squares. */
export function fitHuber(X: number[][], y: number[]): number[] {
  let beta = ols(X, y);
  for (let iter = 0; iter < 60; iter++) {
    const resid = y.map((yi, i) => yi - dot(X[i]!, beta));
    const med = median(resid);
    const mad = median(resid.map((r) => Math.abs(r - med)));
    const s = 1.4826 * mad || 1e-9;
    const w = resid.map((r) => {
      const u = r / (1.345 * s);
      return Math.abs(u) <= 1 ? 1 : 1 / Math.abs(u);
    });
    const beta2 = wls(X, y, w);
    let maxd = 0;
    for (let j = 0; j < beta.length; j++) maxd = Math.max(maxd, Math.abs(beta2[j]! - beta[j]!));
    beta = beta2;
    if (maxd < 1e-10) break;
  }
  return beta;
}

/** Deterministic PRNG (mulberry32) so the bootstrap is identical on every run. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------ features

export function parseDay(iso: string): number {
  const [y, m, d] = iso.split('-').map((v) => parseInt(v, 10));
  return Date.UTC(y!, m! - 1, d!) / 86400000;
}

export function ageDays(p: Proto, asOfDays: number): number | null {
  if (!p.listedAt) return null;
  return Math.max(0, asOfDays - parseDay(p.listedAt));
}

export function featureVector(p: Proto, ctx: ModelCtx): number[] {
  const age = ageDays(p, ctx.asOfDays);
  const a = age === null ? ctx.medAge : age;
  const g = p.change7d === null ? ctx.medChange : p.change7d;
  const gc = Math.max(ctx.clipLo, Math.min(ctx.clipHi, g / 100));
  const x: number[] = [1, Math.log10(p.tvl), gc, Math.log10(a + 1)];
  for (const c of ctx.bigCats) x.push(p.category === c ? 1 : 0);
  return x;
}

export function predictLogValue(p: Proto, coef: number[], ctx: ModelCtx): number {
  return dot(featureVector(p, ctx), coef);
}

export function buildCtx(anchors: Proto[], asOfDays: number): ModelCtx {
  const counts = new Map<string, number>();
  for (const p of anchors) {
    if (p.category) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
  }
  const bigCats = [...counts.entries()].filter(([, n]) => n >= 8).map(([c]) => c).sort();
  const ages = anchors.map((p) => ageDays(p, asOfDays)).filter((a): a is number => a !== null);
  const changes = anchors.map((p) => p.change7d).filter((c): c is number => c !== null);
  return {
    bigCats,
    medAge: median(ages),
    medChange: median(changes),
    asOfDays,
    clipLo: Math.min(...changes) / 100,
    clipHi: Math.max(...changes) / 100,
  };
}

// ------------------------------------------------------------ validation

function missStats(errs: number[]): { miss: number; within3: number } {
  const abs = errs.map((e) => Math.abs(e));
  return { miss: Math.pow(10, median(abs)), within3: (abs.filter((e) => e <= Math.log10(3)).length / abs.length) * 100 };
}

function foldOf(slug: string): number {
  let s = 0;
  for (let i = 0; i < slug.length; i++) s += slug.charCodeAt(i);
  return s % 5;
}

/** Fit + validate the model on the traded-token anchors. */
export function fitAndValidate(anchors: Proto[], board: Proto[], asOfDays: number): FitResult {
  const ctx = buildCtx(anchors, asOfDays);
  const X = anchors.map((p) => featureVector(p, ctx));
  const y = anchors.map((p) => Math.log10(p.mcap!));
  const coef = fitHuber(X, y);

  const flatRatio = median(anchors.map((p) => p.mcap! / p.tvl));
  const flatPred = (p: Proto): number => Math.log10(flatRatio * p.tvl);

  const inErr = anchors.map((p, i) => dot(X[i]!, coef) - y[i]!);
  const inStats = missStats(inErr);

  // 5-fold cross-validation, deterministic folds by slug hash.
  const cvErr: number[] = [];
  const flatCvErr: number[] = [];
  for (let k = 0; k < 5; k++) {
    const tr = anchors.map((p, i) => i).filter((i) => foldOf(anchors[i]!.slug) !== k);
    const te = anchors.map((p, i) => i).filter((i) => foldOf(anchors[i]!.slug) === k);
    const b = fitHuber(tr.map((i) => X[i]!), tr.map((i) => y[i]!));
    for (const i of te) {
      cvErr.push(dot(X[i]!, b) - y[i]!);
      flatCvErr.push(flatPred(anchors[i]!) - y[i]!);
    }
  }
  const cvStats = missStats(cvErr);
  const flatCvStats = missStats(flatCvErr);

  // Blind holdout: fold 0 held out, never touched while fitting.
  const trIdx = anchors.map((p, i) => i).filter((i) => foldOf(anchors[i]!.slug) !== 0);
  const teIdx = anchors.map((p, i) => i).filter((i) => foldOf(anchors[i]!.slug) === 0);
  const bBlind = fitHuber(trIdx.map((i) => X[i]!), trIdx.map((i) => y[i]!));
  const blindErr = teIdx.map((i) => dot(X[i]!, bBlind) - y[i]!);
  const blindStats = missStats(blindErr);
  const flatBlindStats = missStats(teIdx.map((i) => flatPred(anchors[i]!) - y[i]!));

  // Walk-forward: train on the older half (by listing date), test on the newer half.
  const listed = anchors.map((p, i) => ({ age: ageDays(p, asOfDays), i })).filter((o): o is { age: number; i: number } => o.age !== null);
  const medListedAge = median(listed.map((o) => o.age));
  const wTr = listed.filter((o) => o.age > medListedAge).map((o) => o.i);
  const wTe = listed.filter((o) => o.age <= medListedAge).map((o) => o.i);
  let walkStats = { miss: NaN, within3: NaN };
  if (wTr.length > 10 && wTe.length > 10) {
    const bWalk = fitHuber(wTr.map((i) => X[i]!), wTr.map((i) => y[i]!));
    walkStats = missStats(wTe.map((i) => dot(X[i]!, bWalk) - y[i]!));
  }

  // Ablation: refit without each term group; blind miss + Top-20 kept on the board.
  const boardX = board.map((p) => featureVector(p, ctx));
  const fullPred = boardX.map((x) => dot(x, coef));
  const fullTop20 = new Set(fullPred.map((v, i) => [v, i] as [number, number]).sort((a, b) => b[0] - a[0]).slice(0, 20).map(([, i]) => i));
  const termGroups: { term: string; drop: number[] }[] = [
    { term: 'growth (7d change)', drop: [2] },
    { term: 'seasoning (age)', drop: [3] },
    { term: 'family offsets', drop: ctx.bigCats.map((_, j) => 4 + j) },
    { term: 'size (log TVL)', drop: [1] },
  ];
  const ablation = termGroups.map(({ term, drop }) => {
    const keep = X[0]!.map((_, j) => j).filter((j) => !drop.includes(j));
    const b = fitHuber(trIdx.map((i) => keep.map((j) => X[i]![j]!)), trIdx.map((i) => y[i]!));
    const e = teIdx.map((i) => dot(keep.map((j) => X[i]![j]!), b) - y[i]!);
    const s = missStats(e);
    const pred2 = boardX.map((x) => dot(keep.map((j) => x[j]!), b));
    const top2 = new Set(pred2.map((v, i) => [v, i] as [number, number]).sort((a, b) => b[0] - a[0]).slice(0, 20).map(([, i]) => i));
    let kept = 0;
    for (const i of fullTop20) if (top2.has(i)) kept++;
    return { term, blindMiss: s.miss, blindWithin3: s.within3, top20Kept: kept };
  });

  return {
    coef,
    ctx,
    validation: {
      inMiss: inStats.miss,
      inWithin3: inStats.within3,
      cvMiss: cvStats.miss,
      cvWithin3: cvStats.within3,
      flatCvMiss: flatCvStats.miss,
      flatCvWithin3: flatCvStats.within3,
      blindMiss: blindStats.miss,
      blindWithin3: blindStats.within3,
      blindN: teIdx.length,
      flatBlindMiss: flatBlindStats.miss,
      flatBlindWithin3: flatBlindStats.within3,
      walkMiss: walkStats.miss,
      walkWithin3: walkStats.within3,
      walkN: wTe.length,
      flatRatio,
      ablation,
    },
  };
}

/** 200 bootstrap refits: per board row, the P10/P90 of the predicted value and the rank range. */
export function bootstrapBands(
  anchors: Proto[],
  board: Proto[],
  coef: number[],
  ctx: ModelCtx,
  refits = 200,
): { p10: number[]; p90: number[]; rankLo: number[]; rankHi: number[] } {
  const X = anchors.map((p) => featureVector(p, ctx));
  const y = anchors.map((p) => Math.log10(p.mcap!));
  const boardX = board.map((p) => featureVector(p, ctx));
  const n = board.length;
  const preds: number[][] = [];
  const rng = mulberry32(20261114);
  for (let r = 0; r < refits; r++) {
    const idx: number[] = [];
    for (let i = 0; i < anchors.length; i++) idx.push(Math.floor(rng() * anchors.length));
    let b: number[];
    try {
      b = fitHuber(idx.map((i) => X[i]!), idx.map((i) => y[i]!));
    } catch {
      b = coef;
    }
    const pr = boardX.map((x) => dot(x, b));
    // A degenerate resample can still explode; discard refits whose
    // predictions leave the sane range instead of letting them widen the bands.
    if (pr.every((v) => Number.isFinite(v) && Math.abs(v) < 15)) preds.push(pr);
  }
  if (preds.length < 50) throw new Error(`bootstrapBands: only ${preds.length} usable refits`);
  const refitsUsed = preds.length;
  const p10: number[] = [];
  const p90: number[] = [];
  const rankLo = new Array<number>(n).fill(n);
  const rankHi = new Array<number>(n).fill(1);
  for (let j = 0; j < n; j++) {
    const col = preds.map((row) => row[j]!).sort((a, b) => a - b);
    p10.push(Math.pow(10, col[Math.floor(0.1 * (refitsUsed - 1))]!));
    p90.push(Math.pow(10, col[Math.floor(0.9 * (refitsUsed - 1))]!));
  }
  for (let r = 0; r < refitsUsed; r++) {
    const order = preds[r]!.map((v, i) => [v, i] as [number, number]).sort((a, b) => b[0] - a[0]);
    for (let rank = 0; rank < order.length; rank++) {
      const j = order[rank]![1]!;
      rankLo[j] = Math.min(rankLo[j]!, rank + 1);
      rankHi[j] = Math.max(rankHi[j]!, rank + 1);
    }
  }
  return { p10, p90, rankLo, rankHi };
}
