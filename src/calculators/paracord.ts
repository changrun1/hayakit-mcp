export type Mode = 'round' | 'straight';
export type Unit = 'cm' | 'in';
export type FitEase = '0' | '0.5' | '1.0';
export type WeaveKey = 'cobra' | 'kingCobra' | 'fishtail' | 'snake' | 'custom';
export type ColorMode = '1' | '2';
export type BucklePreset = '0' | '2.7' | '3.5' | '4.5' | 'custom';
export type MarginPct = '0' | '10' | '20';

export const CM_PER_INCH = 2.54;
export const DEFAULT_TAIL_CM = 30;
export const DEFAULT_TAIL_IN = '11.811';
export const DEFAULT_THICKNESS_CM = 0.8;
export const DEFAULT_THICKNESS_IN = '0.315';

export interface WeavePresetSpec {
  thicknessCm: number;
  widthCm: number;
  ratio1: number;
  ratio2A: number;
  ratio2B: number;
  supports2Color: boolean;
}

export const WEAVE_SPECS: Record<Exclude<WeaveKey, 'custom'>, WeavePresetSpec> = {
  cobra: {
    thicknessCm: 0.8,
    widthCm: 1.6,
    ratio1: 13.0,
    ratio2A: 8.0,
    ratio2B: 8.0,
    supports2Color: true,
  },
  kingCobra: {
    thicknessCm: 1.5,
    widthCm: 3.0,
    ratio1: 26.0,
    ratio2A: 13.0,
    ratio2B: 13.0,
    supports2Color: true,
  },
  fishtail: {
    thicknessCm: 0.7,
    widthCm: 1.5,
    ratio1: 11.5,
    ratio2A: 5.75,
    ratio2B: 5.75,
    supports2Color: true,
  },
  snake: {
    thicknessCm: 1.1,
    widthCm: 1.3,
    ratio1: 11.0,
    ratio2A: 11.0,
    ratio2B: 0,
    supports2Color: false,
  },
};

export interface ParacordInput {
  m: Mode;
  u: Unit;
  w: string;
  f: FitEase;
  k: WeaveKey;
  c: ColorMode;
  bp: BucklePreset;
  b: string;
  t: string;
  ma: string;
  mb: string;
  mg: MarginPct;
  tl: string;
}

export const DEFAULT_INPUT: ParacordInput = {
  m: 'round',
  u: 'cm',
  w: '',
  f: '0.5',
  k: 'cobra',
  c: '1',
  bp: '3.5',
  b: '',
  t: '0.8',
  ma: '130',
  mb: '80',
  mg: '10',
  tl: '30',
};

export const EXAMPLE_INPUT: ParacordInput = {
  ...DEFAULT_INPUT,
  w: '17.5',
};

export type FieldErrorKey = 'w' | 'b' | 't' | 'ma' | 'mb' | 'tl';
export type FieldErrorCode = 'w_range' | 'b_range' | 't_range' | 'ma_range' | 'mb_range' | 'tl_range';

export interface ParacordOkResult {
  status: 'ok';
  mode: Mode;
  unit: Unit;
  weave: WeaveKey;
  colors: ColorMode;
  wCm: number;
  fCm: number;
  tCm: number;
  bendCm: number;
  bCm: number;
  lFlatCm: number;
  lWeaveCm: number;
  lFlatIn: number;
  lWeaveIn: number;
  ratioA: number;
  ratioB: number;
  tlCm: number;
  mgPct: number;
  netACm: number;
  netBCm: number;
  cutACm: number;
  cutBCm: number;
  cutTotalCm: number;
  cutAIn: number;
  cutBIn: number;
  cutTotalIn: number;
  shortWarning: boolean;
}

export interface ParacordBuckleErrorResult {
  status: 'buckle_too_long';
  mode: Mode;
  unit: Unit;
  wCm: number;
  fCm: number;
  tCm: number;
  bendCm: number;
  bCm: number;
  lFlatCm: number;
  lWeaveCm: number;
}

export interface ParacordInvalidResult {
  status: 'invalid';
  errors: Partial<Record<FieldErrorKey, FieldErrorCode>>;
}

export interface ParacordEmptyResult {
  status: 'empty';
}

export type ParacordResult =
  | ParacordOkResult
  | ParacordBuckleErrorResult
  | ParacordInvalidResult
  | ParacordEmptyResult;

/** Normalize NFKC, trim, and parse a plain decimal number. */
export function parseNumberInput(raw: string): number | null {
  const s = raw.normalize('NFKC').trim();
  if (!s || !/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Convert a numeric length string cleanly between cm and in. */
export function convertLengthString(raw: string, from: Unit, to: Unit): string {
  if (from === to) return raw;
  const trimmed = raw.normalize('NFKC').trim();
  if (!trimmed) return '';
  const n = parseNumberInput(trimmed);
  if (n === null) return raw;
  if (to === 'in') {
    return String(Number((n / CM_PER_INCH).toFixed(3)));
  }
  return String(Number((n * CM_PER_INCH).toFixed(2)));
}

/** Format a number with fixed decimals and strip trailing zeros only when requested. */
export function formatFixed(val: number, decimals: number): string {
  return val.toFixed(decimals);
}

/** Compute bend-compensated flat length, jig span, and per-color cut lengths. */
export function calculateParacord(input: ParacordInput): ParacordResult {
  const u: Unit = input.u === 'in' ? 'in' : 'cm';
  const m: Mode = input.m === 'straight' ? 'straight' : 'round';
  const k: WeaveKey = input.k;
  const effectiveC: ColorMode = k === 'snake' ? '1' : input.c === '2' ? '2' : '1';
  const wTrim = input.w.normalize('NFKC').trim();

  const errors: Partial<Record<FieldErrorKey, FieldErrorCode>> = {};

  // Validate active non-w fields first so bad values in custom/advanced fields still report when w is entered,
  // or when those fields themselves contain invalid non-empty text.
  const bTrim = input.b.normalize('NFKC').trim();
  let bVal: number | null = null;
  if (input.bp === 'custom') {
    if (wTrim !== '' || bTrim !== '') {
      bVal = parseNumberInput(input.b);
      const bCmCheck = bVal === null ? null : u === 'in' ? bVal * CM_PER_INCH : bVal;
      if (bCmCheck === null || bCmCheck < 0 || bCmCheck > 50) {
        errors.b = 'b_range';
      }
    }
  } else {
    bVal = Number(input.bp);
  }

  let tVal: number | null = null;
  let maVal: number | null = null;
  let mbVal: number | null = null;
  if (k === 'custom') {
    tVal = parseNumberInput(input.t);
    const tCmCheck = tVal === null ? null : u === 'in' ? tVal * CM_PER_INCH : tVal;
    if (tCmCheck === null || tCmCheck <= 0 || tCmCheck > 10) {
      errors.t = 't_range';
    }
    maVal = parseNumberInput(input.ma);
    if (maVal === null || maVal <= 0 || maVal > 1000) {
      errors.ma = 'ma_range';
    }
    if (effectiveC === '2') {
      mbVal = parseNumberInput(input.mb);
      if (mbVal === null || mbVal <= 0 || mbVal > 1000) {
        errors.mb = 'mb_range';
      }
    }
  }

  const tlVal = parseNumberInput(input.tl);
  const tlCmCheck = tlVal === null ? null : u === 'in' ? tlVal * CM_PER_INCH : tlVal;
  if (tlCmCheck === null || tlCmCheck < 0 || tlCmCheck > 200) {
    errors.tl = 'tl_range';
  }

  if (wTrim === '') {
    if (Object.keys(errors).length > 0) {
      return { status: 'invalid', errors };
    }
    return { status: 'empty' };
  }

  const wVal = parseNumberInput(input.w);
  const wMax = u === 'in' ? 120 : 300;
  if (wVal === null || wVal <= 0 || wVal > wMax) {
    errors.w = 'w_range';
  }

  if (Object.keys(errors).length > 0) {
    return { status: 'invalid', errors };
  }

  const wCm = u === 'in' ? wVal! * CM_PER_INCH : wVal!;
  const fCm = m === 'round' ? Number(input.f) : 0;
  const tCm =
    k === 'custom'
      ? u === 'in'
        ? tVal! * CM_PER_INCH
        : tVal!
      : WEAVE_SPECS[k].thicknessCm;
  const bCm =
    input.bp === 'custom'
      ? u === 'in'
        ? bVal! * CM_PER_INCH
        : bVal!
      : Number(input.bp);

  const bendCm = m === 'round' ? Math.PI * tCm : 0;
  const lFlatCm = m === 'round' ? wCm + fCm + bendCm : wCm;
  const lWeaveCm = lFlatCm - bCm;

  if (lWeaveCm <= 0) {
    return {
      status: 'buckle_too_long',
      mode: m,
      unit: u,
      wCm,
      fCm,
      tCm,
      bendCm,
      bCm,
      lFlatCm,
      lWeaveCm,
    };
  }

  let ratioA: number;
  let ratioB: number;
  if (k === 'custom') {
    ratioA = maVal! / 10;
    ratioB = effectiveC === '2' ? mbVal! / 10 : 0;
  } else {
    const spec = WEAVE_SPECS[k];
    ratioA = effectiveC === '2' ? spec.ratio2A : spec.ratio1;
    ratioB = effectiveC === '2' ? spec.ratio2B : 0;
  }

  const tlCm = u === 'in' ? tlVal! * CM_PER_INCH : tlVal!;
  const mgPct = Number(input.mg);
  const factor = 1 + mgPct / 100;

  const netACm = lWeaveCm * ratioA + tlCm;
  const netBCm = effectiveC === '2' ? lWeaveCm * ratioB + tlCm : 0;

  const cutACm = Math.ceil(netACm * factor - 1e-9);
  const cutBCm = effectiveC === '2' ? Math.ceil(netBCm * factor - 1e-9) : 0;
  const cutAIn = Math.ceil((netACm * factor / CM_PER_INCH) * 2 - 1e-9) / 2;
  const cutBIn =
    effectiveC === '2' ? Math.ceil((netBCm * factor / CM_PER_INCH) * 2 - 1e-9) / 2 : 0;

  return {
    status: 'ok',
    mode: m,
    unit: u,
    weave: k,
    colors: effectiveC,
    wCm,
    fCm,
    tCm,
    bendCm,
    bCm,
    lFlatCm,
    lWeaveCm,
    lFlatIn: lFlatCm / CM_PER_INCH,
    lWeaveIn: lWeaveCm / CM_PER_INCH,
    ratioA,
    ratioB,
    tlCm,
    mgPct,
    netACm,
    netBCm,
    cutACm,
    cutBCm,
    cutTotalCm: cutACm + cutBCm,
    cutAIn,
    cutBIn,
    cutTotalIn: cutAIn + cutBIn,
    shortWarning: lWeaveCm < 5,
  };
}

const VALID_WEAVES: WeaveKey[] = ['cobra', 'kingCobra', 'fishtail', 'snake', 'custom'];
const VALID_BUCKLES: BucklePreset[] = ['0', '2.7', '3.5', '4.5', 'custom'];

/** Restore tool input from URL query parameters, falling back cleanly to defaults. */
export function parseQueryState(q: Record<string, string>): ParacordInput {
  const m: Mode = q.m === 'straight' ? 'straight' : 'round';
  const u: Unit = q.u === 'in' ? 'in' : 'cm';
  const f: FitEase = q.f === '0' ? '0' : q.f === '1' || q.f === '1.0' ? '1.0' : '0.5';
  const k: WeaveKey = VALID_WEAVES.includes(q.k as WeaveKey) ? (q.k as WeaveKey) : 'cobra';
  const c: ColorMode = q.c === '2' ? '2' : '1';
  const bp: BucklePreset = VALID_BUCKLES.includes(q.bp as BucklePreset) ? (q.bp as BucklePreset) : '3.5';
  const mg: MarginPct = q.mg === '0' ? '0' : q.mg === '20' ? '20' : '10';

  return {
    m,
    u,
    w: q.w ?? '',
    f,
    k,
    c,
    bp,
    b: q.b ?? '',
    t: q.t ?? (u === 'in' ? DEFAULT_THICKNESS_IN : '0.8'),
    ma: q.ma ?? '130',
    mb: q.mb ?? '80',
    mg,
    tl: q.tl ?? (u === 'in' ? DEFAULT_TAIL_IN : '30'),
  };
}

/** Serialize tool input into URL query parameters, omitting defaults. */
export function toQueryState(input: ParacordInput): Record<string, string> {
  const out: Record<string, string> = {};
  if (input.m !== 'round') out.m = input.m;
  if (input.u !== 'cm') out.u = input.u;
  const w = input.w.normalize('NFKC').trim();
  if (w !== '') out.w = w;
  if (input.m === 'round' && input.f !== '0.5') out.f = input.f;
  if (input.k !== 'cobra') out.k = input.k;
  if (input.k !== 'snake' && input.c !== '1') out.c = input.c;
  if (input.bp !== '3.5') out.bp = input.bp;
  if (input.bp === 'custom') {
    const b = input.b.normalize('NFKC').trim();
    if (b !== '') out.b = b;
  }
  if (input.k === 'custom') {
    const defaultT = input.u === 'in' ? DEFAULT_THICKNESS_IN : '0.8';
    const t = input.t.normalize('NFKC').trim();
    if (t !== '' && t !== defaultT) out.t = t;
    const ma = input.ma.normalize('NFKC').trim();
    if (ma !== '' && ma !== '130') out.ma = ma;
    if (input.c === '2') {
      const mb = input.mb.normalize('NFKC').trim();
      if (mb !== '' && mb !== '80') out.mb = mb;
    }
  }
  if (input.mg !== '10') out.mg = input.mg;
  const defaultTl = input.u === 'in' ? DEFAULT_TAIL_IN : '30';
  const tl = input.tl.normalize('NFKC').trim();
  if (tl !== '' && tl !== defaultTl) out.tl = tl;
  return out;
}
