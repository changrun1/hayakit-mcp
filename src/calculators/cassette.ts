export type CassetteTierId = 'C10' | 'C20' | 'C30' | 'C45' | 'C46' | 'C54' | 'C60' | 'C90' | 'C120';
export type CassetteFormat = CassetteTierId | 'custom' | 'dup';
export type SplitMode = 'seq' | 'opt' | 'manual';
export type SideStatus = 'ok' | 'tight' | 'overflow';

export interface CassetteTier {
  id: CassetteTierId;
  totalMin: number;
  capSec: number;
}

export const CASSETTE_TIERS: readonly CassetteTier[] = [
  { id: 'C10', totalMin: 10, capSec: 300 },
  { id: 'C20', totalMin: 20, capSec: 600 },
  { id: 'C30', totalMin: 30, capSec: 900 },
  { id: 'C45', totalMin: 45, capSec: 1350 },
  { id: 'C46', totalMin: 46, capSec: 1380 },
  { id: 'C54', totalMin: 54, capSec: 1620 },
  { id: 'C60', totalMin: 60, capSec: 1800 },
  { id: 'C90', totalMin: 90, capSec: 2700 },
  { id: 'C120', totalMin: 120, capSec: 3600 },
];

export const TIER_CAP: Record<CassetteTierId, number> = {
  C10: 300,
  C20: 600,
  C30: 900,
  C45: 1350,
  C46: 1380,
  C54: 1620,
  C60: 1800,
  C90: 2700,
  C120: 3600,
};

/** Lengths sold today (Maxell UR 10/20/60/90, T&A 46/54, C120). C30/C45 stay selectable but are never recommended. */
export const RECOMMEND_TIERS: readonly CassetteTierId[] = ['C10', 'C20', 'C46', 'C54', 'C60', 'C90', 'C120'];

export const DEFAULT_FORMAT: CassetteFormat = 'C60';
export const DEFAULT_MODE: SplitMode = 'seq';
export const DEFAULT_GAP = 2;
export const DEFAULT_RESERVE = 14;

export interface ParsedTrack {
  /** 0-based original index among valid parsed tracks. */
  index: number;
  /** 1-based physical line number in the input text. */
  lineNo: number;
  /** Track title without trailing separators; empty string if only duration was provided. */
  title: string;
  /** Duration in integer seconds (> 0). */
  duration: number;
  raw: string;
}

export interface TrackLineError {
  lineNo: number;
  raw: string;
}

export interface ParseTracksResult {
  tracks: ParsedTrack[];
  errors: TrackLineError[];
}

export interface SideTrackEntry {
  index: number;
  title: string;
  duration: number;
  start: number;
  end: number;
}

export interface SideResult {
  tracks: SideTrackEntry[];
  count: number;
  music: number;
  gaps: number;
  content: number;
  used: number;
  rem: number;
  overflow: number;
  status: SideStatus;
}

export interface PlanParams {
  tracks: ParsedTrack[];
  format: CassetteFormat;
  /** Required when format === 'custom', in integer seconds (60..7200). */
  customCapSec?: number;
  mode: SplitMode;
  gap: number;
  reserve: number;
  manualIndicesA?: number[];
  manualIndicesB?: number[];
}

export interface PlanWarnings {
  thinTape: boolean;
  dupMinShort: boolean;
  dupMinShortBy: number;
  speedCaution: boolean;
}

export interface PlanResult {
  format: CassetteFormat;
  mode: SplitMode;
  cap: number;
  gap: number;
  reserve: number;
  head: number;
  tail: number;
  sideA: SideResult;
  sideB: SideResult;
  status: SideStatus;
  diff: number;
  minTape: CassetteTierId | null;
  dupSide: number;
  dupTotal: number;
  dupBlankMin: number;
  shorterBlank: number;
  warnings: PlanWarnings;
}

const RE_COLON = /(?<!\d)(?:(\d+):)?(\d{1,3}):([0-5]\d)$/;
const RE_MIN_SEC = /(?<!\d)(\d{1,3})分(?:(\d{1,2})秒)?$/;
const RE_SEC = /(?<!\d)(\d{1,4})秒$/;
const RE_TRAILING_SEP = /[\s\-–—/|・]+$/;

/** Parse newline-separated tracklist lines after NFKC normalization. */
export function parseTrackLines(input: string): ParseTracksResult {
  const normalized = input.normalize('NFKC');
  const lines = normalized.split(/\r?\n/);
  const tracks: ParsedTrack[] = [];
  const errors: TrackLineError[] = [];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;

    const lineNo = i + 1;
    let duration = 0;
    let matchIndex = -1;

    const mColon = RE_COLON.exec(trimmed);
    if (mColon) {
      const h = mColon[1] !== undefined ? Number(mColon[1]) : 0;
      const m = Number(mColon[2]);
      const s = Number(mColon[3]);
      if (mColon[1] === undefined || m < 60) {
        duration = h * 3600 + m * 60 + s;
        matchIndex = mColon.index;
      }
    } else {
      const mMin = RE_MIN_SEC.exec(trimmed);
      if (mMin) {
        const m = Number(mMin[1]);
        const s = mMin[2] !== undefined ? Number(mMin[2]) : 0;
        duration = m * 60 + s;
        matchIndex = mMin.index;
      } else {
        const mSec = RE_SEC.exec(trimmed);
        if (mSec) {
          duration = Number(mSec[1]);
          matchIndex = mSec.index;
        }
      }
    }

    if (matchIndex < 0 || !Number.isInteger(duration) || duration <= 0) {
      errors.push({ lineNo, raw: trimmed });
      continue;
    }

    const title = trimmed.slice(0, matchIndex).replace(RE_TRAILING_SEP, '').trim();
    tracks.push({
      index: tracks.length,
      lineNo,
      title,
      duration,
      raw: trimmed,
    });
  }

  return { tracks, errors };
}

/** Parse custom per-side capacity from `mm:ss` or decimal minutes `1`..`120` into seconds (`60`..`7200`). */
export function parseCustomCapacity(raw: string): number | null {
  const s = raw.normalize('NFKC').trim();
  if (!s) return null;

  let sec: number | null = null;
  const mColon = /^(\d{1,3}):([0-5]\d)$/.exec(s);
  if (mColon) {
    sec = Number(mColon[1]) * 60 + Number(mColon[2]);
  } else if (/^\d+(?:\.\d+)?$/.test(s)) {
    const mins = Number(s);
    if (Number.isFinite(mins)) sec = Math.round(mins * 60);
  }

  if (sec === null || !Number.isInteger(sec) || sec < 60 || sec > 7200) return null;
  return sec;
}

/** Format non-negative seconds as `m:ss` (e.g. `0:59`, `20:47`, `60:00`). */
export function formatDuration(sec: number): string {
  const abs = Math.max(0, Math.round(sec));
  const m = Math.floor(abs / 60);
  const s = abs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Format signed remaining/overflow seconds (`+9:13` or `-1:00`). */
export function formatSignedTime(rem: number): string {
  const sign = rem < 0 ? '-' : '+';
  return `${sign}${formatDuration(Math.abs(rem))}`;
}

/** Format counter timestamp with 2-digit zero-padded minutes (`00:07`, `36:47`). */
export function formatCounter(sec: number): string {
  const abs = Math.max(0, Math.round(sec));
  const m = Math.floor(abs / 60);
  const s = abs % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Compute per-side totals, counter timestamps, and capacity status. */
export function computeSide(tracks: ParsedTrack[], cap: number, gap: number, reserve: number): SideResult {
  const n = tracks.length;
  if (n === 0) {
    return {
      tracks: [],
      count: 0,
      music: 0,
      gaps: 0,
      content: 0,
      used: 0,
      rem: cap,
      overflow: 0,
      status: 'ok',
    };
  }

  const head = Math.floor(reserve / 2);
  let cursor = head;
  let music = 0;
  const entries: SideTrackEntry[] = [];

  for (let i = 0; i < n; i++) {
    const tr = tracks[i];
    if (i > 0) cursor += gap;
    const start = cursor;
    const end = start + tr.duration;
    cursor = end;
    music += tr.duration;
    entries.push({
      index: tr.index,
      title: tr.title,
      duration: tr.duration,
      start,
      end,
    });
  }

  const gaps = (n - 1) * gap;
  const content = music + gaps;
  const used = content + reserve;
  const rem = cap - used;
  const overflow = cap > 0 ? Math.max(0, used - cap) : 0;

  let status: SideStatus = 'ok';
  if (cap > 0) {
    if (content > cap) status = 'overflow';
    else if (used > cap) status = 'tight';
  }

  return {
    tracks: entries,
    count: n,
    music,
    gaps,
    content,
    used,
    rem,
    overflow,
    status,
  };
}

function sideUsedFromSummary(count: number, music: number, gap: number, reserve: number): number {
  if (count === 0) return 0;
  return music + (count - 1) * gap + reserve;
}

interface Score {
  overflowSum: number;
  diff: number;
  aShorter: number;
  noTrack0InA: number;
  indicesA: number[];
}

function compareScores(a: Score, b: Score): number {
  if (a.overflowSum !== b.overflowSum) return a.overflowSum - b.overflowSum;
  if (a.diff !== b.diff) return a.diff - b.diff;
  if (a.aShorter !== b.aShorter) return a.aShorter - b.aShorter;
  if (a.noTrack0InA !== b.noTrack0InA) return a.noTrack0InA - b.noTrack0InA;
  const len = Math.min(a.indicesA.length, b.indicesA.length);
  for (let i = 0; i < len; i++) {
    if (a.indicesA[i] !== b.indicesA[i]) return a.indicesA[i] - b.indicesA[i];
  }
  return a.indicesA.length - b.indicesA.length;
}

/** Sequential split (`k = 0..N`): Side A = `[0..k-1]`, Side B = `[k..N-1]`. */
export function splitSequential(
  tracks: ParsedTrack[],
  cap: number,
  gap: number,
  reserve: number,
): { indicesA: number[]; indicesB: number[]; k: number } {
  const n = tracks.length;
  const prefix = new Array<number>(n + 1).fill(0);
  for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i] + tracks[i].duration;
  const totalMusic = prefix[n];

  let bestK = 0;
  let bestTuple: [number, number, number, number] | null = null;

  for (let k = 0; k <= n; k++) {
    const usedA = sideUsedFromSummary(k, prefix[k], gap, reserve);
    const usedB = sideUsedFromSummary(n - k, totalMusic - prefix[k], gap, reserve);
    const overA = cap > 0 ? Math.max(0, usedA - cap) : 0;
    const overB = cap > 0 ? Math.max(0, usedB - cap) : 0;
    const tuple: [number, number, number, number] = [
      overA + overB,
      Math.abs(usedA - usedB),
      usedA < usedB ? 1 : 0,
      k,
    ];
    if (
      !bestTuple ||
      tuple[0] < bestTuple[0] ||
      (tuple[0] === bestTuple[0] &&
        (tuple[1] < bestTuple[1] ||
          (tuple[1] === bestTuple[1] &&
            (tuple[2] < bestTuple[2] || (tuple[2] === bestTuple[2] && tuple[3] < bestTuple[3])))))
    ) {
      bestTuple = tuple;
      bestK = k;
    }
  }

  const indicesA = Array.from({ length: bestK }, (_, i) => i);
  const indicesB = Array.from({ length: n - bestK }, (_, i) => bestK + i);
  return { indicesA, indicesB, k: bestK };
}

function scoreMask(
  mask: number,
  n: number,
  musicA: number,
  countA: number,
  totalMusic: number,
  cap: number,
  gap: number,
  reserve: number,
): { overflowSum: number; diff: number; aShorter: number; noTrack0InA: number } {
  const usedA = sideUsedFromSummary(countA, musicA, gap, reserve);
  const usedB = sideUsedFromSummary(n - countA, totalMusic - musicA, gap, reserve);
  const overA = cap > 0 ? Math.max(0, usedA - cap) : 0;
  const overB = cap > 0 ? Math.max(0, usedB - cap) : 0;
  return {
    overflowSum: overA + overB,
    diff: Math.abs(usedA - usedB),
    aShorter: usedA < usedB ? 1 : 0,
    noTrack0InA: (mask & 1) !== 0 ? 0 : 1,
  };
}

function maskToIndices(mask: number, n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    if ((mask & (1 << i)) !== 0) out.push(i);
  }
  return out;
}

function compareLex(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return a.length - b.length;
}

/** Optimal balanced split preserving relative order per side. */
export function splitOptimal(
  tracks: ParsedTrack[],
  cap: number,
  gap: number,
  reserve: number,
): { indicesA: number[]; indicesB: number[] } {
  const n = tracks.length;
  if (n === 0) return { indicesA: [], indicesB: [] };

  const durations = tracks.map((t) => t.duration);
  const totalMusic = durations.reduce((a, b) => a + b, 0);

  if (n <= 18) {
    const totalMasks = 1 << n;
    const dpSum = new Int32Array(totalMasks);
    const dpCount = new Uint8Array(totalMasks);
    for (let mask = 1; mask < totalMasks; mask++) {
      const lsb = mask & -mask;
      const bit = Math.clz32(lsb) ^ 31;
      dpSum[mask] = dpSum[mask ^ lsb] + durations[bit];
      dpCount[mask] = dpCount[mask ^ lsb] + 1;
    }

    let bestMask = 0;
    let best4 = scoreMask(0, n, 0, 0, totalMusic, cap, gap, reserve);
    let bestIndicesA: number[] | null = null;

    for (let mask = 1; mask < totalMasks; mask++) {
      const s = scoreMask(mask, n, dpSum[mask], dpCount[mask], totalMusic, cap, gap, reserve);
      const cmp =
        s.overflowSum - best4.overflowSum ||
        s.diff - best4.diff ||
        s.aShorter - best4.aShorter ||
        s.noTrack0InA - best4.noTrack0InA;
      if (cmp < 0) {
        best4 = s;
        bestMask = mask;
        bestIndicesA = null;
      } else if (cmp === 0) {
        if (!bestIndicesA) bestIndicesA = maskToIndices(bestMask, n);
        const curIndicesA = maskToIndices(mask, n);
        if (compareLex(curIndicesA, bestIndicesA) < 0) {
          bestMask = mask;
          bestIndicesA = curIndicesA;
        }
      }
    }

    const indicesA = bestIndicesA ?? maskToIndices(bestMask, n);
    const inA = new Set(indicesA);
    const indicesB: number[] = [];
    for (let i = 0; i < n; i++) {
      if (!inA.has(i)) indicesB.push(i);
    }
    return { indicesA, indicesB };
  }

  // N > 18: LPT greedy descending by duration + single-move & pairwise-swap local search
  const sorted = Array.from({ length: n }, (_, i) => i).sort(
    (a, b) => durations[b] - durations[a] || a - b,
  );
  const inA = new Uint8Array(n);
  let countA = 0;
  let musicA = 0;

  for (const idx of sorted) {
    const curA = sideUsedFromSummary(countA, musicA, gap, reserve);
    const curB = sideUsedFromSummary(n - countA, totalMusic - musicA, gap, reserve);
    if (curA <= curB) {
      inA[idx] = 1;
      countA++;
      musicA += durations[idx];
    }
  }

  const makeScore = (arr: Uint8Array, cA: number, mA: number): Score => {
    const usedA = sideUsedFromSummary(cA, mA, gap, reserve);
    const usedB = sideUsedFromSummary(n - cA, totalMusic - mA, gap, reserve);
    const overA = cap > 0 ? Math.max(0, usedA - cap) : 0;
    const overB = cap > 0 ? Math.max(0, usedB - cap) : 0;
    const indicesA: number[] = [];
    for (let i = 0; i < n; i++) if (arr[i]) indicesA.push(i);
    return {
      overflowSum: overA + overB,
      diff: Math.abs(usedA - usedB),
      aShorter: usedA < usedB ? 1 : 0,
      noTrack0InA: arr[0] ? 0 : 1,
      indicesA,
    };
  };

  let curScore = makeScore(inA, countA, musicA);
  for (let iter = 0; iter < 200; iter++) {
    let bestAction: { type: 'move'; i: number } | { type: 'swap'; i: number; j: number } | null = null;
    let bestScore = curScore;

    // Single-move neighborhood
    for (let i = 0; i < n; i++) {
      const wasA = inA[i] === 1;
      inA[i] = wasA ? 0 : 1;
      const ncA = countA + (wasA ? -1 : 1);
      const nmA = musicA + (wasA ? -durations[i] : durations[i]);
      const sc = makeScore(inA, ncA, nmA);
      if (compareScores(sc, bestScore) < 0) {
        bestScore = sc;
        bestAction = { type: 'move', i };
      }
      inA[i] = wasA ? 1 : 0;
    }

    // Pairwise-swap neighborhood (i in A, j in B)
    for (let i = 0; i < n; i++) {
      if (!inA[i]) continue;
      for (let j = 0; j < n; j++) {
        if (inA[j]) continue;
        inA[i] = 0;
        inA[j] = 1;
        const nmA = musicA - durations[i] + durations[j];
        const sc = makeScore(inA, countA, nmA);
        if (compareScores(sc, bestScore) < 0) {
          bestScore = sc;
          bestAction = { type: 'swap', i, j };
        }
        inA[i] = 1;
        inA[j] = 0;
      }
    }

    if (!bestAction) break;
    if (bestAction.type === 'move') {
      const i = bestAction.i;
      const wasA = inA[i] === 1;
      inA[i] = wasA ? 0 : 1;
      countA += wasA ? -1 : 1;
      musicA += wasA ? -durations[i] : durations[i];
    } else {
      const { i, j } = bestAction;
      inA[i] = 0;
      inA[j] = 1;
      musicA += durations[j] - durations[i];
    }
    curScore = bestScore;
  }

  const indicesA: number[] = [];
  const indicesB: number[] = [];
  for (let i = 0; i < n; i++) {
    if (inA[i]) indicesA.push(i);
    else indicesB.push(i);
  }
  return { indicesA, indicesB };
}

/** Find smallest commercial tier whose per-side capacity covers `maxSideUsed`, or null if > C120. */
export function recommendTier(maxSideUsed: number): CassetteTierId | null {
  for (const id of RECOMMEND_TIERS) {
    if (TIER_CAP[id] >= maxSideUsed) return id;
  }
  return null;
}

/** Encode manual side assignment + optional custom track order for URL `s` parameter. */
export function encodeManualState(n: number, indicesA: number[], indicesB: number[]): string {
  if (n === 0) return '';
  const sides = new Array<string>(n).fill('B');
  for (const idx of indicesA) if (idx >= 0 && idx < n) sides[idx] = 'A';
  const sideStr = sides.join('');

  const isAsc = (arr: number[]) => arr.every((v, i) => i === 0 || v > arr[i - 1]);
  if (isAsc(indicesA) && isAsc(indicesB)) {
    return sideStr;
  }
  return `${sideStr};${[...indicesA, ...indicesB].join(',')}`;
}

/** Decode manual side assignment + optional order from URL `s` parameter. */
export function decodeManualState(
  s: string,
  n: number,
): { indicesA: number[]; indicesB: number[] } | null {
  if (!s || n <= 0) return null;
  const [sideStr, orderStr] = s.split(';');
  if (!sideStr || sideStr.length !== n || !/^[AB]+$/.test(sideStr)) return null;

  if (!orderStr) {
    const indicesA: number[] = [];
    const indicesB: number[] = [];
    for (let i = 0; i < n; i++) {
      if (sideStr[i] === 'A') indicesA.push(i);
      else indicesB.push(i);
    }
    return { indicesA, indicesB };
  }

  const nums = orderStr.split(',').map((x) => Number(x));
  if (nums.length !== n) return null;
  const seen = new Set<number>();
  for (const num of nums) {
    if (!Number.isInteger(num) || num < 0 || num >= n || seen.has(num)) return null;
    seen.add(num);
  }

  const indicesA: number[] = [];
  const indicesB: number[] = [];
  for (const idx of nums) {
    if (sideStr[idx] === 'A') indicesA.push(idx);
    else indicesB.push(idx);
  }
  return { indicesA, indicesB };
}

/** Compute full cassette A/B plan, recommendations, and warnings. */
export function calculatePlan(params: PlanParams): PlanResult {
  const { tracks, format, customCapSec, mode, gap, reserve } = params;
  const splitCap =
    format === 'dup'
      ? 0
      : format === 'custom'
        ? Math.max(60, customCapSec ?? 1200)
        : TIER_CAP[format];

  let indicesA: number[];
  let indicesB: number[];

  if (mode === 'manual' && params.manualIndicesA && params.manualIndicesB) {
    const valid = new Set<number>();
    const cleanA: number[] = [];
    const cleanB: number[] = [];
    for (const idx of params.manualIndicesA) {
      if (idx >= 0 && idx < tracks.length && !valid.has(idx)) {
        valid.add(idx);
        cleanA.push(idx);
      }
    }
    for (const idx of params.manualIndicesB) {
      if (idx >= 0 && idx < tracks.length && !valid.has(idx)) {
        valid.add(idx);
        cleanB.push(idx);
      }
    }
    for (let i = 0; i < tracks.length; i++) {
      if (!valid.has(i)) cleanB.push(i);
    }
    indicesA = cleanA;
    indicesB = cleanB;
  } else if (mode === 'opt') {
    const res = splitOptimal(tracks, splitCap, gap, reserve);
    indicesA = res.indicesA;
    indicesB = res.indicesB;
  } else {
    const res = splitSequential(tracks, splitCap, gap, reserve);
    indicesA = res.indicesA;
    indicesB = res.indicesB;
  }

  const tracksA = indicesA.map((i) => tracks[i]);
  const tracksB = indicesB.map((i) => tracks[i]);

  // Preliminary calculation to obtain dupSide if format === 'dup'
  const preA = computeSide(tracksA, splitCap, gap, reserve);
  const preB = computeSide(tracksB, splitCap, gap, reserve);
  const dupSide = Math.max(preA.used, preB.used);
  const cap = format === 'dup' ? dupSide : splitCap;

  const sideA = format === 'dup' ? computeSide(tracksA, cap, gap, reserve) : preA;
  const sideB = format === 'dup' ? computeSide(tracksB, cap, gap, reserve) : preB;

  let status: SideStatus = 'ok';
  if (sideA.status === 'overflow' || sideB.status === 'overflow') status = 'overflow';
  else if (sideA.status === 'tight' || sideB.status === 'tight') status = 'tight';

  const diff = Math.abs(sideA.used - sideB.used);
  const minTape = recommendTier(dupSide);
  const dupTotal = 2 * dupSide;
  const dupBlankMin = Math.ceil(dupSide / 60) * 2;
  const shorterBlank = diff;

  const minSideRem = Math.min(sideA.rem, sideB.rem);
  const warnings: PlanWarnings = {
    thinTape: format === 'C120' || minTape === 'C120',
    dupMinShort: dupSide > 0 && dupSide < 90,
    dupMinShortBy: dupSide > 0 && dupSide < 90 ? 90 - dupSide : 0,
    speedCaution:
      format !== 'dup' &&
      status === 'ok' &&
      dupSide > 0 &&
      minSideRem >= 0 &&
      minSideRem <= Math.floor(cap * 0.02),
  };

  return {
    format,
    mode,
    cap,
    gap,
    reserve,
    head: Math.floor(reserve / 2),
    tail: reserve - Math.floor(reserve / 2),
    sideA,
    sideB,
    status,
    diff,
    minTape,
    dupSide,
    dupTotal,
    dupBlankMin,
    shorterBlank,
    warnings,
  };
}

export interface TimelineSvgLabels {
  title: string;
  subtitle: string;
  sideA: string;
  sideB: string;
  recLabel: string;
  recValue: string;
  dupLabel: string;
  dupValue: string;
  capLabel: string;
  ariaTitle: string;
  ariaDesc: string;
}

function escXml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

function truncateText(s: string, maxChars: number): string {
  if (s.length <= maxChars) return s;
  return s.slice(0, Math.max(1, maxChars - 1)) + '…';
}

/** Generate inner SVG markup for the `560x320` Timeline card. */
export function buildTimelineSvgInner(plan: PlanResult, labels: TimelineSvgLabels): string {
  const x0 = 68;
  const barW = 462;
  const scaleMax = Math.max(plan.cap, plan.sideA.used, plan.sideB.used, 1);
  const pxPerSec = barW / scaleMax;

  const renderBar = (side: SideResult, y: number, sideLabel: string): string => {
    const parts: string[] = [];
    parts.push(
      `<text x="20" y="${y + 27}" font-size="12" font-weight="700" fill="var(--ink)">${escXml(sideLabel)}</text>`,
    );
    parts.push(
      `<text x="20" y="${y + 42}" font-size="11" fill="var(--muted)">${escXml(formatDuration(side.used))}</text>`,
    );

    // Base track groove
    const capW = plan.cap * pxPerSec;
    if (plan.cap > 0 && side.used < plan.cap) {
      parts.push(
        `<rect x="${(x0 + side.used * pxPerSec).toFixed(2)}" y="${y}" width="${((plan.cap - side.used) * pxPerSec).toFixed(2)}" height="44" rx="4" fill="none" stroke="var(--line-strong)" stroke-width="1.2" stroke-dasharray="4 3" />`,
      );
    }

    if (side.count > 0) {
      // Head leader buffer
      if (plan.head > 0) {
        const hw = plan.head * pxPerSec;
        parts.push(
          `<rect x="${x0.toFixed(2)}" y="${y}" width="${hw.toFixed(2)}" height="44" fill="var(--line)" fill-opacity="0.85" />`,
        );
      }

      // Track blocks
      side.tracks.forEach((tr, i) => {
        const tx = x0 + tr.start * pxPerSec;
        const tw = tr.duration * pxPerSec;
        const isEven = i % 2 === 0;
        const isOver = plan.cap > 0 && plan.format !== 'dup' && tr.end > plan.cap;
        const fill = isOver ? 'var(--bad)' : isEven ? 'var(--accent)' : 'var(--mark)';
        const textFill = isOver ? 'var(--accent-ink)' : isEven ? 'var(--accent-ink)' : 'var(--ink)';
        const strokeAttr = !isOver && !isEven ? ' stroke="var(--accent)" stroke-width="0.8"' : '';
        parts.push(
          `<rect x="${tx.toFixed(2)}" y="${y}" width="${Math.max(1, tw).toFixed(2)}" height="44" rx="2" fill="${fill}"${strokeAttr} />`,
        );
        const cx = tx + tw / 2;
        if (tw >= 42) {
          parts.push(
            `<text x="${cx.toFixed(2)}" y="${y + 19}" font-size="11" font-weight="700" text-anchor="middle" fill="${textFill}">#${tr.index + 1}</text>`,
          );
          parts.push(
            `<text x="${cx.toFixed(2)}" y="${y + 34}" font-size="9.5" text-anchor="middle" fill="${textFill}" opacity="0.9">${formatDuration(tr.duration)}</text>`,
          );
        } else if (tw >= 18) {
          parts.push(
            `<text x="${cx.toFixed(2)}" y="${y + 26}" font-size="10.5" font-weight="700" text-anchor="middle" fill="${textFill}">#${tr.index + 1}</text>`,
          );
        }
      });

      // Tail leader buffer
      if (plan.tail > 0) {
        const tailStart = side.used - plan.tail;
        const tx = x0 + tailStart * pxPerSec;
        const tw = plan.tail * pxPerSec;
        const isOver = plan.cap > 0 && plan.format !== 'dup' && side.used > plan.cap;
        parts.push(
          `<rect x="${tx.toFixed(2)}" y="${y}" width="${tw.toFixed(2)}" height="44" fill="${isOver ? 'var(--bad)' : 'var(--line)'}" fill-opacity="${isOver ? '0.45' : '0.85'}" />`,
        );
      }

      // Overflow cap highlight bar if side.used > plan.cap
      if (plan.cap > 0 && plan.format !== 'dup' && side.used > plan.cap) {
        const ox = x0 + capW;
        const ow = (side.used - plan.cap) * pxPerSec;
        parts.push(
          `<rect x="${ox.toFixed(2)}" y="${y - 2}" width="${Math.max(2, ow).toFixed(2)}" height="48" fill="none" stroke="var(--bad)" stroke-width="1.5" />`,
        );
      }
    }

    return parts.join('');
  };

  const capX = x0 + plan.cap * pxPerSec;
  const cautionSec = Math.floor(plan.cap * 0.98);
  const cautionX = x0 + cautionSec * pxPerSec;

  const endAX = x0 + plan.sideA.used * pxPerSec;
  const endBX = x0 + plan.sideB.used * pxPerSec;
  const minEndX = Math.min(endAX, endBX);
  const maxEndX = Math.max(endAX, endBX);
  const midEndX = (minEndX + maxEndX) / 2;
  const diffText = `Δ ${formatDuration(plan.diff)}`;

  const midTickSec = Math.round(scaleMax / 2);

  return [
    `<title>${escXml(labels.ariaTitle)}</title>`,
    `<desc>${escXml(labels.ariaDesc)}</desc>`,
    `<rect x="0.5" y="0.5" width="559" height="319" rx="10" fill="var(--surface)" stroke="var(--line)" />`,
    `<text x="20" y="29" font-size="15" font-weight="700" fill="var(--ink)">${escXml(truncateText(labels.title, 34))}</text>`,
    `<text x="20" y="48" font-size="11.5" fill="var(--muted)">${escXml(labels.subtitle)}</text>`,
    renderBar(plan.sideA, 82, labels.sideA),
    renderBar(plan.sideB, 168, labels.sideB),
    // Imbalance bracket between Side A (y=126) and Side B (y=168)
    plan.diff > 0
      ? `<line x1="${minEndX.toFixed(2)}" y1="133" x2="${minEndX.toFixed(2)}" y2="161" stroke="var(--accent)" stroke-width="1.2" />` +
        `<line x1="${maxEndX.toFixed(2)}" y1="133" x2="${maxEndX.toFixed(2)}" y2="161" stroke="var(--accent)" stroke-width="1.2" />` +
        `<line x1="${minEndX.toFixed(2)}" y1="147" x2="${maxEndX.toFixed(2)}" y2="147" stroke="var(--accent)" stroke-width="1.4" />` +
        `<rect x="${(Math.min(Math.max(midEndX - 28, x0), 484)).toFixed(2)}" y="137" width="56" height="18" rx="4" fill="var(--surface)" />` +
        `<text x="${(Math.min(Math.max(midEndX, x0 + 28), 512)).toFixed(2)}" y="150" font-size="11" font-weight="700" text-anchor="middle" fill="var(--accent)">${escXml(diffText)}</text>`
      : `<line x1="${endAX.toFixed(2)}" y1="132" x2="${endAX.toFixed(2)}" y2="162" stroke="var(--accent)" stroke-width="1.4" />` +
        `<rect x="${(Math.min(Math.max(endAX - 28, x0), 484)).toFixed(2)}" y="137" width="56" height="18" rx="4" fill="var(--surface)" />` +
        `<text x="${(Math.min(Math.max(endAX, x0 + 28), 512)).toFixed(2)}" y="150" font-size="11" font-weight="700" text-anchor="middle" fill="var(--accent)">${escXml(diffText)}</text>`,
    // Speed caution -1.5% dashed tick
    plan.cap > 0 && plan.format !== 'dup'
      ? `<line x1="${cautionX.toFixed(2)}" y1="74" x2="${cautionX.toFixed(2)}" y2="220" stroke="var(--muted)" stroke-width="1" stroke-dasharray="3 3" />`
      : '',
    // Capacity vertical tick
    plan.cap > 0
      ? `<line x1="${capX.toFixed(2)}" y1="70" x2="${capX.toFixed(2)}" y2="224" stroke="var(--ink)" stroke-width="1.5" />` +
        `<text x="${Math.min(capX, 530).toFixed(2)}" y="66" font-size="10.5" font-weight="600" text-anchor="${capX > 480 ? 'end' : 'middle'}" fill="var(--ink)">${escXml(labels.capLabel)} ${formatDuration(plan.cap)}</text>`
      : '',
    // Time axis
    `<line x1="${x0}" y1="230" x2="${x0 + barW}" y2="230" stroke="var(--line)" stroke-width="1" />`,
    `<text x="${x0}" y="244" font-size="10.5" fill="var(--muted)">0:00</text>`,
    `<text x="${x0 + barW / 2}" y="244" font-size="10.5" text-anchor="middle" fill="var(--muted)">${formatDuration(midTickSec)}</text>`,
    `<text x="${x0 + barW}" y="244" font-size="10.5" text-anchor="end" fill="var(--muted)">${formatDuration(scaleMax)}</text>`,
    // Bottom summary strip
    `<rect x="20" y="260" width="520" height="42" rx="6" fill="var(--paper)" stroke="var(--line)" />`,
    `<text x="34" y="278" font-size="10.5" fill="var(--muted)">${escXml(labels.recLabel)}</text>`,
    `<text x="34" y="294" font-size="13" font-weight="700" fill="var(--ink)">${escXml(labels.recValue)}</text>`,
    `<text x="526" y="278" font-size="10.5" text-anchor="end" fill="var(--muted)">${escXml(labels.dupLabel)}</text>`,
    `<text x="526" y="294" font-size="13" font-weight="700" text-anchor="end" fill="var(--ink)">${escXml(labels.dupValue)}</text>`,
  ].join('');
}

export interface JCardSvgLabels {
  title: string;
  artist: string;
  formatLabel: string;
  sideAHeading: string;
  sideBHeading: string;
  ariaTitle: string;
}

/** Generate inner SVG markup for the `104.8 x 101.6 mm` 3-panel printable J-Card (plain `#000` strokes). */
export function buildJCardSvgInner(plan: PlanResult, labels: JCardSvgLabels): string {
  const parts: string[] = [];
  parts.push(`<title>${escXml(labels.ariaTitle)}</title>`);
  // White card stock + 0.25mm outer cut rect
  parts.push(`<rect x="0" y="0" width="104.8" height="101.6" fill="#fff" stroke="#000" stroke-width="0.25" />`);
  // Dashed fold lines at x=27.0 and x=39.7
  parts.push(
    `<line x1="27.0" y1="0" x2="27.0" y2="101.6" stroke="#000" stroke-width="0.2" stroke-dasharray="1.5 1.5" />`,
  );
  parts.push(
    `<line x1="39.7" y1="0" x2="39.7" y2="101.6" stroke="#000" stroke-width="0.2" stroke-dasharray="1.5 1.5" />`,
  );

  // Panel 1: Rear flap (0 .. 27.0 mm)
  const totalLines = plan.sideA.count + plan.sideB.count + 4;
  const lineH = Math.min(3.8, 88 / Math.max(totalLines, 1));
  const fontSz = Math.min(2.3, lineH * 0.65);
  let y = 5.5;

  const drawSideList = (heading: string, side: SideResult) => {
    parts.push(
      `<text x="2.2" y="${y.toFixed(2)}" font-size="${(fontSz + 0.3).toFixed(2)}" font-weight="700" fill="#000">${escXml(heading)} (${formatDuration(side.used)})</text>`,
    );
    y += lineH;
    for (const tr of side.tracks) {
      const name = tr.title ? tr.title : `#${tr.index + 1}`;
      parts.push(
        `<text x="2.2" y="${y.toFixed(2)}" font-size="${fontSz.toFixed(2)}" fill="#000">${escXml(truncateText(name, 14))}</text>`,
      );
      parts.push(
        `<text x="25.0" y="${y.toFixed(2)}" font-size="${fontSz.toFixed(2)}" text-anchor="end" fill="#000">${formatDuration(tr.duration)}</text>`,
      );
      y += lineH;
    }
    y += lineH * 0.45;
  };

  drawSideList(labels.sideAHeading, plan.sideA);
  drawSideList(labels.sideBHeading, plan.sideB);

  // Panel 2: Spine (27.0 .. 39.7 mm -> width 12.7 mm, center x = 33.35)
  const spineTitle = labels.title.trim();
  const spineArtist = labels.artist.trim();
  const spineText = [spineTitle, spineArtist, labels.formatLabel].filter(Boolean).join(' — ');
  parts.push(
    `<text x="33.35" y="50.8" transform="rotate(90 33.35 50.8)" font-size="3.0" font-weight="700" text-anchor="middle" dominant-baseline="central" fill="#000">${escXml(truncateText(spineText, 36))}</text>`,
  );

  // Panel 3: Front cover (39.7 .. 104.8 mm -> width 65.1 mm)
  const frontX = 44.5;
  const frontMaxX = 100.0;
  if (spineTitle) {
    parts.push(
      `<text x="${frontX}" y="14" font-size="4.6" font-weight="700" fill="#000">${escXml(truncateText(spineTitle, 20))}</text>`,
    );
  } else {
    parts.push(`<line x1="${frontX}" y1="14.5" x2="${frontMaxX}" y2="14.5" stroke="#000" stroke-width="0.2" />`);
  }

  if (spineArtist) {
    parts.push(
      `<text x="${frontX}" y="21" font-size="3.2" fill="#000">${escXml(truncateText(spineArtist, 26))}</text>`,
    );
  } else {
    parts.push(`<line x1="${frontX}" y1="21.5" x2="${frontMaxX}" y2="21.5" stroke="#000" stroke-width="0.2" />`);
  }

  parts.push(`<line x1="${frontX}" y1="26" x2="${frontMaxX}" y2="26" stroke="#000" stroke-width="0.35" />`);

  // Front cover track summary (Side A & Side B)
  const frontLineH = Math.min(3.8, 56 / Math.max(plan.sideA.count + plan.sideB.count + 3, 1));
  const frontFont = Math.min(2.4, frontLineH * 0.66);
  let fy = 31.5;

  const drawFrontSide = (heading: string, side: SideResult) => {
    parts.push(
      `<text x="${frontX}" y="${fy.toFixed(2)}" font-size="${(frontFont + 0.3).toFixed(2)}" font-weight="700" fill="#000">${escXml(heading)} — ${formatDuration(side.used)}</text>`,
    );
    fy += frontLineH;
    for (const tr of side.tracks) {
      const name = tr.title ? tr.title : `#${tr.index + 1}`;
      parts.push(
        `<text x="${frontX}" y="${fy.toFixed(2)}" font-size="${frontFont.toFixed(2)}" fill="#000">${escXml(truncateText(name, 26))}</text>`,
      );
      parts.push(
        `<text x="${frontMaxX}" y="${fy.toFixed(2)}" font-size="${frontFont.toFixed(2)}" text-anchor="end" fill="#000">${formatDuration(tr.duration)}</text>`,
      );
      fy += frontLineH;
    }
    fy += frontLineH * 0.4;
  };

  drawFrontSide(labels.sideAHeading, plan.sideA);
  drawFrontSide(labels.sideBHeading, plan.sideB);

  // Format badge at bottom-right of front cover
  parts.push(
    `<text x="${frontMaxX}" y="96.5" font-size="2.8" font-weight="700" text-anchor="end" fill="#000">${escXml(labels.formatLabel)}</text>`,
  );

  return parts.join('');
}
