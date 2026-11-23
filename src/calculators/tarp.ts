export type TarpType = 'rect' | 'hex' | 'custom';
export type PoleTie = 'double' | 'single';
export type GuyAngle = 35 | 45 | 55;
export type SitePreset = '600x480' | '400x600' | '800x500' | 'custom' | 'none';

export interface TarpInput {
  t: TarpType;
  tw: string;
  tb: string;
  mc: string;
  mh: string;
  mt: PoleTie;
  sc: string;
  sh: string;
  pc: string;
  pl: string;
  wm: string;
  ang: GuyAngle;
  a: string;
  site: SitePreset;
  sw: string;
  sb: string;
}

export const DEFAULT_INPUT: TarpInput = {
  t: 'rect',
  tw: '',
  tb: '',
  mc: '2',
  mh: '',
  mt: 'double',
  sc: '4',
  sh: '',
  pc: '0',
  pl: '300',
  wm: '0',
  ang: 45,
  a: '50',
  site: '600x480',
  sw: '',
  sb: '',
};

export const EXAMPLE_INPUT: TarpInput = {
  t: 'rect',
  tw: '500',
  tb: '400',
  mc: '2',
  mh: '280',
  mt: 'double',
  sc: '4',
  sh: '180',
  pc: '0',
  pl: '300',
  wm: '0',
  ang: 45,
  a: '50',
  site: '600x480',
  sw: '',
  sb: '',
};

export interface TarpErrors {
  tw?: string;
  tb?: string;
  mc?: string;
  mh?: string;
  sc?: string;
  sh?: string;
  pc?: string;
  pl?: string;
  wm?: string;
  a?: string;
  sw?: string;
  sb?: string;
}

export interface CutRow {
  id: 'main' | 'side' | 'corner' | 'water';
  tie: PoleTie | 'single';
  count: number;
  cutCm: number;
  subtotalCm: number;
  hardwareCount: number;
}

export interface TarpOkResult {
  status: 'ok';
  errors: TarpErrors;
  t: TarpType;
  ang: GuyAngle;
  a: number;
  mc: number;
  mt: PoleTie;
  mh: number | null;
  sc: number;
  sh: number | null;
  pc: number;
  pl: number;
  wm: number;
  rows: CutRow[];
  totalCm: number;
  totalM: string;
  wasteCm: number;
  wasteM: string;
  rollAdvice: string;
  tensioners: number;
  pegs: number;
  mainDiagCm: number | null;
  sideDiagCm: number | null;
  dMain: number;
  dSide: number;
  dCorner: number;
  tw: number | null;
  tb: number | null;
  fpL: number | null;
  fpB: number | null;
  fpL55: number | null;
  fpB55: number | null;
  site: SitePreset;
  sw: number | null;
  sb: number | null;
  exL: number | null;
  exB: number | null;
  fitsSite: boolean | null;
  fitsRotated: boolean;
}

export interface TarpIncompleteResult {
  status: 'incomplete';
  errors: TarpErrors;
}

export type TarpResult = TarpOkResult | TarpIncompleteResult;

export function normalizeNumberStr(raw: string): string {
  return raw
    .replace(/[０-９．－]/g, (ch) => {
      if (ch === '．') return '.';
      if (ch === '－') return '-';
      return String.fromCharCode(ch.charCodeAt(0) - 0xfee0);
    })
    .trim();
}

function parseRangeInt(
  raw: string,
  min: number,
  max: number,
  isCm: boolean,
): { value: number | null; error?: string } {
  const s = normalizeNumberStr(raw);
  if (s === '') return { value: null };
  if (!/^-?\d+$/.test(s)) {
    return {
      value: null,
      error: isCm ? `請輸入 ${min}～${max} cm` : `請輸入 ${min}～${max} 的整數`,
    };
  }
  const n = Number(s);
  if (n < min || n > max) {
    return {
      value: null,
      error: isCm ? `請輸入 ${min}～${max} cm` : `請輸入 ${min}～${max} 的整數`,
    };
  }
  return { value: n };
}

export function ceil10(cm: number): number {
  return Math.ceil((cm - 1e-9) / 10) * 10;
}

export function diagLength(heightCm: number, angleDeg: GuyAngle): number {
  const rad = (angleDeg * Math.PI) / 180;
  return heightCm / Math.sin(rad);
}

export function horizontalDist(heightCm: number, angleDeg: GuyAngle): number {
  const rad = (angleDeg * Math.PI) / 180;
  return Math.round(heightCm / Math.tan(rad));
}

export function cornerDist(lineCm: number, angleDeg: GuyAngle): number {
  return Math.round(lineCm * Math.cos((angleDeg * Math.PI) / 180));
}

export function getRollAdvice(totalCm: number, wasteCm: number): string {
  const wasteM = wasteCm / 100;
  let base: string;
  if (wasteM <= 20) base = '20 m × 1 捲';
  else if (wasteM <= 30) base = '30 m × 1 捲';
  else if (wasteM <= 50) base = '50 m × 1 捲';
  else base = `${Math.ceil(wasteCm / 5000)} 捲 50 m`;

  if (totalCm <= 3000 && wasteCm > 3000) {
    return `${base}（實長未滿 30 m 但含 5% 損耗超過，買 30 m 會剛好緊繃）`;
  }
  return base;
}

export function presetSiteDims(site: SitePreset): { sw: number | null; sb: number | null } {
  if (site === '600x480') return { sw: 600, sb: 480 };
  if (site === '400x600') return { sw: 400, sb: 600 };
  if (site === '800x500') return { sw: 800, sb: 500 };
  return { sw: null, sb: null };
}

export function calculateTarp(input: TarpInput): TarpResult {
  const errors: TarpErrors = {};

  const twParsed = parseRangeInt(input.tw, 100, 1500, true);
  if (twParsed.error) errors.tw = twParsed.error;
  const tbParsed = parseRangeInt(input.tb, 100, 1500, true);
  if (tbParsed.error) errors.tb = tbParsed.error;

  const mcParsed = parseRangeInt(input.mc, 0, 6, false);
  if (mcParsed.error) errors.mc = mcParsed.error;
  const mc = mcParsed.value ?? 0;

  const mhParsed = parseRangeInt(input.mh, 50, 500, true);
  if (mhParsed.error) errors.mh = mhParsed.error;

  const scParsed = parseRangeInt(input.sc, 0, 8, false);
  if (scParsed.error) errors.sc = scParsed.error;
  const sc = scParsed.value ?? 0;

  const shParsed = parseRangeInt(input.sh, 50, 400, true);
  if (shParsed.error) errors.sh = shParsed.error;

  const pcParsed = parseRangeInt(input.pc, 0, 8, false);
  if (pcParsed.error) errors.pc = pcParsed.error;
  const pc = pcParsed.value ?? 0;

  const plParsed = parseRangeInt(input.pl, 100, 600, true);
  if (plParsed.error) errors.pl = plParsed.error;
  const pl = plParsed.value ?? 300;

  const wmParsed = parseRangeInt(input.wm, 0, 4, false);
  if (wmParsed.error) errors.wm = wmParsed.error;
  const wm = wmParsed.value ?? 0;

  const aParsed = parseRangeInt(input.a, 30, 80, true);
  if (aParsed.error) errors.a = aParsed.error;
  const a = aParsed.value ?? 50;

  let sw: number | null = null;
  let sb: number | null = null;
  if (input.site === 'custom') {
    const swParsed = parseRangeInt(input.sw, 200, 3000, true);
    if (swParsed.error) errors.sw = swParsed.error;
    const sbParsed = parseRangeInt(input.sb, 200, 3000, true);
    if (sbParsed.error) errors.sb = sbParsed.error;
    sw = swParsed.value;
    sb = sbParsed.value;
  } else {
    const dims = presetSiteDims(input.site);
    sw = dims.sw;
    sb = dims.sb;
  }

  const mh = mhParsed.value;
  const sh = shParsed.value;

  const missingMain = mc > 0 && mh === null;
  const missingSide = sc > 0 && sh === null;
  const noPoints = mc + sc + pc + wm === 0;

  if (missingMain || missingSide || noPoints) {
    return { status: 'incomplete', errors };
  }

  const rows: CutRow[] = [];
  let mainDiagCm: number | null = null;
  let sideDiagCm: number | null = null;
  let sideCutCm = 0;

  if (mc > 0 && mh !== null) {
    mainDiagCm = diagLength(mh, input.ang);
    const cutCm =
      input.mt === 'double'
        ? ceil10(2 * (mainDiagCm + a))
        : ceil10(mainDiagCm + a);
    const hw = mc * (input.mt === 'double' ? 2 : 1);
    rows.push({
      id: 'main',
      tie: input.mt,
      count: mc,
      cutCm,
      subtotalCm: mc * cutCm,
      hardwareCount: hw,
    });
  }

  if (sc > 0 && sh !== null) {
    sideDiagCm = diagLength(sh, input.ang);
    sideCutCm = ceil10(sideDiagCm + a);
    rows.push({
      id: 'side',
      tie: 'single',
      count: sc,
      cutCm: sideCutCm,
      subtotalCm: sc * sideCutCm,
      hardwareCount: sc,
    });
  }

  if (pc > 0) {
    rows.push({
      id: 'corner',
      tie: 'single',
      count: pc,
      cutCm: pl,
      subtotalCm: pc * pl,
      hardwareCount: pc,
    });
  }

  if (wm > 0) {
    const waterCut = sc > 0 && sh !== null ? sideCutCm : pl;
    rows.push({
      id: 'water',
      tie: 'single',
      count: wm,
      cutCm: waterCut,
      subtotalCm: wm * waterCut,
      hardwareCount: wm,
    });
  }

  const totalCm = rows.reduce((sum, r) => sum + r.subtotalCm, 0);
  const totalM = (totalCm / 100).toFixed(2);
  const wasteCm = Math.ceil(totalCm * 1.05 - 1e-9);
  const wasteM = (wasteCm / 100).toFixed(2);
  const rollAdvice = getRollAdvice(totalCm, wasteCm);
  const tensioners = rows.reduce((sum, r) => sum + r.hardwareCount, 0);
  const pegs = tensioners;

  const dMain = mc > 0 && mh !== null ? horizontalDist(mh, input.ang) : 0;
  const dSide = sc > 0 && sh !== null ? horizontalDist(sh, input.ang) : 0;
  const dCorner = pc > 0 ? cornerDist(pl - a, input.ang) : 0;

  const tw = twParsed.value;
  const tb = tbParsed.value;
  const fpL = tw !== null && tb !== null ? tw + 2 * dMain : null;
  const fpB = tw !== null && tb !== null ? tb + 2 * Math.max(dSide, dCorner) : null;

  const dMain55 = mc > 0 && mh !== null ? horizontalDist(mh, 55) : 0;
  const dSide55 = sc > 0 && sh !== null ? horizontalDist(sh, 55) : 0;
  const dCorner55 = pc > 0 ? cornerDist(pl - a, 55) : 0;
  const fpL55 = tw !== null && tb !== null ? tw + 2 * dMain55 : null;
  const fpB55 = tw !== null && tb !== null ? tb + 2 * Math.max(dSide55, dCorner55) : null;

  let exL: number | null = null;
  let exB: number | null = null;
  let fitsSite: boolean | null = null;
  let fitsRotated = false;

  if (fpL !== null && fpB !== null && input.site !== 'none' && sw !== null && sb !== null) {
    exL = fpL - sw;
    exB = fpB - sb;
    fitsSite = fpL <= sw && fpB <= sb;
    if (!fitsSite) {
      fitsRotated = fpL <= sb && fpB <= sw;
    }
  }

  return {
    status: 'ok',
    errors,
    t: input.t,
    ang: input.ang,
    a,
    mc,
    mt: input.mt,
    mh,
    sc,
    sh,
    pc,
    pl,
    wm,
    rows,
    totalCm,
    totalM,
    wasteCm,
    wasteM,
    rollAdvice,
    tensioners,
    pegs,
    mainDiagCm,
    sideDiagCm,
    dMain,
    dSide,
    dCorner,
    tw,
    tb,
    fpL,
    fpB,
    fpL55,
    fpB55,
    site: input.site,
    sw,
    sb,
    exL,
    exB,
    fitsSite,
    fitsRotated,
  };
}

export function toQueryState(input: TarpInput): Record<string, string> {
  const q: Record<string, string> = {};
  if (input.t !== 'rect') q.t = input.t;
  if (normalizeNumberStr(input.tw) !== '') q.tw = normalizeNumberStr(input.tw);
  if (normalizeNumberStr(input.tb) !== '') q.tb = normalizeNumberStr(input.tb);
  if (normalizeNumberStr(input.mc) !== '2') q.mc = normalizeNumberStr(input.mc);
  if (normalizeNumberStr(input.mh) !== '') q.mh = normalizeNumberStr(input.mh);
  if (input.mt !== 'double') q.mt = input.mt;
  const defaultSc = input.t === 'hex' ? '0' : '4';
  if (normalizeNumberStr(input.sc) !== defaultSc) q.sc = normalizeNumberStr(input.sc);
  if (normalizeNumberStr(input.sh) !== '') q.sh = normalizeNumberStr(input.sh);
  const defaultPc = input.t === 'hex' ? '4' : '0';
  if (normalizeNumberStr(input.pc) !== defaultPc) q.pc = normalizeNumberStr(input.pc);
  if (normalizeNumberStr(input.pl) !== '300') q.pl = normalizeNumberStr(input.pl);
  if (normalizeNumberStr(input.wm) !== '0') q.wm = normalizeNumberStr(input.wm);
  if (input.ang !== 45) q.ang = String(input.ang);
  if (normalizeNumberStr(input.a) !== '50') q.a = normalizeNumberStr(input.a);
  if (input.site !== '600x480') q.site = input.site;
  if (input.site === 'custom') {
    if (normalizeNumberStr(input.sw) !== '') q.sw = normalizeNumberStr(input.sw);
    if (normalizeNumberStr(input.sb) !== '') q.sb = normalizeNumberStr(input.sb);
  }
  return q;
}

export function parseQueryState(q: Record<string, string>): TarpInput {
  const t: TarpType = q.t === 'hex' || q.t === 'custom' || q.t === 'rect' ? q.t : 'rect';
  const defaultSc = t === 'hex' ? '0' : '4';
  const defaultPc = t === 'hex' ? '4' : '0';

  const angNum = Number(q.ang);
  const ang: GuyAngle = angNum === 35 || angNum === 45 || angNum === 55 ? angNum : 45;

  const mt: PoleTie = q.mt === 'single' ? 'single' : 'double';
  const site: SitePreset =
    q.site === '600x480' ||
    q.site === '400x600' ||
    q.site === '800x500' ||
    q.site === 'custom' ||
    q.site === 'none'
      ? q.site
      : '600x480';

  return {
    t,
    tw: q.tw ?? '',
    tb: q.tb ?? '',
    mc: q.mc ?? '2',
    mh: q.mh ?? '',
    mt,
    sc: q.sc ?? defaultSc,
    sh: q.sh ?? '',
    pc: q.pc ?? defaultPc,
    pl: q.pl ?? '300',
    wm: q.wm ?? '0',
    ang,
    a: q.a ?? '50',
    site,
    sw: site === 'custom' ? (q.sw ?? '') : '',
    sb: site === 'custom' ? (q.sb ?? '') : '',
  };
}
