export type BadgePreset = '44' | '57' | '75' | 'other';
export type FoldMode = 'h' | 't' | 'p';
export type TierCount = 1 | 2 | 3;

export interface RosetteInput {
  bPreset: BadgePreset;
  bCustom: number | null;
  n: TierCount;
  w: [number | null, number | null, number | null];
  c: [string, string, string];
  f: FoldMode;
  s: number | null;
  d: number | null;
  ta: number | null;
  tb: number | null;
  tc: number | null;
  tl: number | null;
  m: number | null;
  g: number | null;
}

export const DEFAULT_INPUT: RosetteInput = {
  bPreset: '57',
  bCustom: null,
  n: 2,
  w: [36, 24, 15],
  c: ['#2f5d9e', '#8fb3e0', '#f3d36b'],
  f: 'h',
  s: 10,
  d: 15,
  ta: null,
  tb: null,
  tc: 2,
  tl: 15,
  m: 5,
  g: 10,
};

export type FieldErrorKey =
  | 'b'
  | 'w1'
  | 'w2'
  | 'w3'
  | 's'
  | 'd'
  | 'ta'
  | 'tb'
  | 'tc'
  | 'tl'
  | 'm'
  | 'g';

export interface TierResult {
  tier: 1 | 2 | 3;
  w: number;
  c: string;
  oMm: number;
  oCm: number;
  oCmStr: string;
  buyCm: number;
  lMm: number;
  lCm: number;
  lCmStr: string;
}

export interface RosetteOkResult {
  status: 'ok';
  b: number;
  n: TierCount;
  f: FoldMode;
  m: number;
  g: number;
  s: number | null;
  d: number | null;
  ta: number | null;
  tb: number | null;
  tc: number;
  tl: number;
  pMm: number;
  pCm: number;
  pCmStr: string;
  cMm: number;
  cMmStr: string;
  k: number;
  kStr: string;
  lMm: number;
  lMmStr: string;
  lCm: number;
  lCmStr: string;
  buyCm: number;
  pleats: number | null;
  svgPleats: number;
  tiers: TierResult[];
  oMaxMm: number;
  oMaxCm: number;
  oMaxCmStr: string;
  tailTotalCm: number;
  totalCm: number;
  warnings: string[];
}

export type RosetteResult =
  | {
      status: 'prompt';
      promptKey: 'needB' | 'needTestFold';
      errors: Partial<Record<FieldErrorKey, string>>;
    }
  | {
      status: 'error';
      errors: Partial<Record<FieldErrorKey, string>>;
    }
  | RosetteOkResult;

const OVERLAP_ALLOWANCE_MM = 15;

export function fmtNum(v: number): string {
  if (Number.isInteger(v)) return String(v);
  const rounded = Math.round(v * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

function isFiniteInRange(v: number | null, min: number, max: number): v is number {
  return v !== null && Number.isFinite(v) && v >= min && v <= max;
}

function normalizeHex(raw: string | undefined, fallback: string): string {
  if (!raw) return fallback;
  const match = raw.trim().match(/^#?([0-9a-fA-F]{6})$/);
  return match ? `#${match[1].toLowerCase()}` : fallback;
}

export function calculateRosette(input: RosetteInput): RosetteResult {
  const errors: Partial<Record<FieldErrorKey, string>> = {};
  let missingB = false;
  let missingTestFold = false;

  // 1. Badge diameter
  let bVal: number | null = null;
  if (input.bPreset === '44') bVal = 44;
  else if (input.bPreset === '57') bVal = 57;
  else if (input.bPreset === '75') bVal = 75;
  else {
    if (input.bCustom === null) {
      missingB = true;
    } else if (!isFiniteInRange(input.bCustom, 20, 150)) {
      errors.b = '20〜150mmで入れてください';
    } else {
      bVal = input.bCustom;
    }
  }

  // 2. 台紙のはみ出し & のりしろ
  if (!isFiniteInRange(input.m, 0, 30)) {
    errors.m = '0〜30mmで入れてください';
  }
  const gValid = isFiniteInRange(input.g, 3, 30);
  if (!gValid) {
    errors.g = '3〜30mmで入れてください';
  }

  // 3. Tier widths
  const wKeys: readonly ('w1' | 'w2' | 'w3')[] = ['w1', 'w2', 'w3'];
  for (let i = 0; i < input.n; i++) {
    const wi = input.w[i];
    const key = wKeys[i];
    if (!isFiniteInRange(wi, 3, 100)) {
      errors[key] = '3〜100mmで入れてください';
    } else if (gValid && wi <= input.g!) {
      errors[key] = `のりしろ（${fmtNum(input.g!)}mm）より広い幅にしてください`;
    }
  }

  // 4. Fold mode parameters
  if (input.f === 'h') {
    if (!isFiniteInRange(input.s, 3, 30)) {
      errors.s = '3〜30mmで入れてください';
    }
    if (!isFiniteInRange(input.d, 1, 40)) {
      errors.d = '1〜40mmで入れてください';
    }
  } else if (input.f === 't') {
    if (input.ta === null || input.tb === null) {
      missingTestFold = true;
      if (input.ta !== null && (!Number.isFinite(input.ta) || input.ta <= 0)) {
        errors.ta = '0より大きい数で入れてください';
      }
      if (input.tb !== null && (!Number.isFinite(input.tb) || input.tb <= 0)) {
        errors.tb = '0より大きい数で入れてください';
      }
    } else if (!Number.isFinite(input.ta) || input.ta <= 0) {
      errors.ta = '0より大きい数で入れてください';
    } else if (!Number.isFinite(input.tb) || input.tb <= 0) {
      errors.tb = '折った後が短すぎます。もう一度測ってください';
    } else if (input.tb >= input.ta) {
      errors.tb = '折った後の長さは、折る前より短くなります';
    } else if (input.ta / input.tb > 10) {
      errors.tb = '折った後が短すぎます。もう一度測ってください';
    }
  }

  // 5. Tails
  const tcValid =
    input.tc !== null && Number.isInteger(input.tc) && input.tc >= 0 && input.tc <= 6;
  if (!tcValid) {
    errors.tc = '0〜6本で入れてください';
  }
  const tlNeeded = tcValid ? input.tc! > 0 : true;
  if (tlNeeded && !isFiniteInRange(input.tl, 1, 60)) {
    errors.tl = '1〜60cmで入れてください';
  }

  if (Object.keys(errors).length > 0) {
    return { status: 'error', errors };
  }

  if (missingB) {
    return { status: 'prompt', promptKey: 'needB', errors };
  }
  if (missingTestFold) {
    return { status: 'prompt', promptKey: 'needTestFold', errors };
  }

  const b = bVal!;
  const m = input.m!;
  const g = input.g!;
  const tc = input.tc!;
  const tl = tc === 0 ? (isFiniteInRange(input.tl, 1, 60) ? input.tl : DEFAULT_INPUT.tl!) : input.tl!;

  const pMm = b + 2 * m;
  const pCm = Math.round(pMm) / 10;
  const pCmStr = pCm.toFixed(1);
  const cMm = Math.PI * pMm;
  const cMmStr = cMm.toFixed(1);

  let k = 1;
  if (input.f === 'h') {
    k = (input.s! + 2 * input.d!) / input.s!;
  } else if (input.f === 't') {
    k = input.ta! / input.tb!;
  }
  const kStr = k.toFixed(2);

  const lMm = (cMm + OVERLAP_ALLOWANCE_MM) * k;
  const lMmStr = lMm.toFixed(1);
  const lCm = Math.round(lMm) / 10;
  const lCmStr = lCm.toFixed(1);
  const buyCm = Math.ceil(Math.round(lMm * 11) / 100);

  const pleats = input.f === 'h' ? Math.max(1, Math.round(cMm / input.s!)) : null;
  const svgPleats = pleats !== null ? pleats : Math.max(1, Math.round(cMm / 10));

  const tiers: TierResult[] = [];
  for (let i = 0; i < input.n; i++) {
    const w = input.w[i]!;
    const c = normalizeHex(input.c[i], DEFAULT_INPUT.c[i]);
    const oMm = pMm + 2 * (w - g);
    const oCm = Math.round(oMm) / 10;
    tiers.push({
      tier: (i + 1) as 1 | 2 | 3,
      w,
      c,
      oMm,
      oCm,
      oCmStr: oCm.toFixed(1),
      buyCm,
      lMm,
      lCm,
      lCmStr,
    });
  }

  const oMaxMm = Math.max(...tiers.map((t) => t.oMm));
  const oMaxCm = Math.round(oMaxMm) / 10;
  const oMaxCmStr = oMaxCm.toFixed(1);
  const tailTotalCm = tc * tl;
  const totalCm = input.n * buyCm + tailTotalCm;

  const warnings: string[] = [];
  for (let i = 1; i < input.n; i++) {
    if (tiers[i].w >= tiers[i - 1].w) {
      warnings.push(
        `${i + 1}段目が${i}段目と同じ幅以上なので、${i}段目が隠れます。外側の段ほど広いリボンにしてください。`,
      );
    }
  }

  return {
    status: 'ok',
    b,
    n: input.n,
    f: input.f,
    m,
    g,
    s: input.f === 'h' ? input.s! : null,
    d: input.f === 'h' ? input.d! : null,
    ta: input.f === 't' ? input.ta! : null,
    tb: input.f === 't' ? input.tb! : null,
    tc,
    tl,
    pMm,
    pCm,
    pCmStr,
    cMm,
    cMmStr,
    k,
    kStr,
    lMm,
    lMmStr,
    lCm,
    lCmStr,
    buyCm,
    pleats,
    svgPleats,
    tiers,
    oMaxMm,
    oMaxCm,
    oMaxCmStr,
    tailTotalCm,
    totalCm,
    warnings,
  };
}

export function buildMemo(res: RosetteOkResult): string {
  const lines = [
    `ロゼット（${fmtNum(res.b)}mm缶バッジ・${res.n}段）`,
    `台紙：直径${res.pCmStr}cm`,
    ...res.tiers.map(
      (t) => `${t.tier}段目：${fmtNum(t.w)}mm幅リボン ${t.buyCm}cm（使う長さ ${t.lCmStr}cm）`,
    ),
  ];
  if (res.tc > 0) {
    lines.push(`テール：${fmtNum(res.tl)}cm × ${res.tc}本 = ${fmtNum(res.tailTotalCm)}cm`);
  }
  lines.push(`合計：${fmtNum(res.totalCm)}cm`);
  lines.push(`仕上がりの直径：約${res.oMaxCmStr}cm`);
  return lines.join('\n');
}

function parseOptionalNumber(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function parseQueryState(query: Record<string, string>): RosetteInput {
  const out: RosetteInput = {
    ...DEFAULT_INPUT,
    w: [...DEFAULT_INPUT.w] as [number | null, number | null, number | null],
    c: [...DEFAULT_INPUT.c] as [string, string, string],
  };

  if (query.b !== undefined) {
    if (query.b === '44' || query.b === '57' || query.b === '75') {
      out.bPreset = query.b;
      out.bCustom = null;
    } else if (query.b === 'other') {
      out.bPreset = 'other';
      out.bCustom = null;
    } else {
      const bNum = parseOptionalNumber(query.b);
      if (isFiniteInRange(bNum, 20, 150)) {
        out.bPreset = 'other';
        out.bCustom = bNum;
      }
    }
  }

  if (query.n === '1' || query.n === '2' || query.n === '3') {
    out.n = Number(query.n) as TierCount;
  }

  const wKeys = ['w1', 'w2', 'w3'] as const;
  for (let i = 0; i < 3; i++) {
    const wNum = parseOptionalNumber(query[wKeys[i]]);
    if (isFiniteInRange(wNum, 3, 100)) {
      out.w[i] = wNum;
    }
  }

  const cKeys = ['c1', 'c2', 'c3'] as const;
  for (let i = 0; i < 3; i++) {
    out.c[i] = normalizeHex(query[cKeys[i]], DEFAULT_INPUT.c[i]);
  }

  if (query.f === 'h' || query.f === 't' || query.f === 'p') {
    out.f = query.f;
  }

  const sNum = parseOptionalNumber(query.s);
  if (isFiniteInRange(sNum, 3, 30)) out.s = sNum;

  const dNum = parseOptionalNumber(query.d);
  if (isFiniteInRange(dNum, 1, 40)) out.d = dNum;

  const taNum = parseOptionalNumber(query.ta);
  if (taNum !== null && taNum > 0) out.ta = taNum;

  const tbNum = parseOptionalNumber(query.tb);
  if (tbNum !== null && tbNum > 0) out.tb = tbNum;

  const tcNum = parseOptionalNumber(query.tc);
  if (tcNum !== null && Number.isInteger(tcNum) && tcNum >= 0 && tcNum <= 6) {
    out.tc = tcNum;
  }

  const tlNum = parseOptionalNumber(query.tl);
  if (isFiniteInRange(tlNum, 1, 60)) out.tl = tlNum;

  const mNum = parseOptionalNumber(query.m);
  if (isFiniteInRange(mNum, 0, 30)) out.m = mNum;

  const gNum = parseOptionalNumber(query.g);
  if (isFiniteInRange(gNum, 3, 30)) out.g = gNum;

  return out;
}

export function toQueryState(input: RosetteInput): Record<string, string> {
  const q: Record<string, string> = {};
  if (input.bPreset === 'other') {
    q.b = input.bCustom !== null && Number.isFinite(input.bCustom) ? String(input.bCustom) : 'other';
  } else {
    q.b = input.bPreset;
  }
  q.n = String(input.n);
  for (let i = 0; i < input.n; i++) {
    const wi = input.w[i];
    if (wi !== null && Number.isFinite(wi)) q[`w${i + 1}`] = String(wi);
    q[`c${i + 1}`] = normalizeHex(input.c[i], DEFAULT_INPUT.c[i]).slice(1);
  }
  q.f = input.f;
  if (input.f === 'h') {
    if (input.s !== null && Number.isFinite(input.s)) q.s = String(input.s);
    if (input.d !== null && Number.isFinite(input.d)) q.d = String(input.d);
  } else if (input.f === 't') {
    if (input.ta !== null && Number.isFinite(input.ta)) q.ta = String(input.ta);
    if (input.tb !== null && Number.isFinite(input.tb)) q.tb = String(input.tb);
  }
  if (input.tc !== null && Number.isFinite(input.tc)) q.tc = String(input.tc);
  if (input.tc !== 0 && input.tl !== null && Number.isFinite(input.tl)) q.tl = String(input.tl);
  if (input.m !== null && Number.isFinite(input.m)) q.m = String(input.m);
  if (input.g !== null && Number.isFinite(input.g)) q.g = String(input.g);
  return q;
}

export interface RosetteSvgTier {
  tier: 1 | 2 | 3;
  color: string;
  polygonPoints: string;
  foldLines: { x1: number; y1: number; x2: number; y2: number }[];
}

export interface RosetteSvgTail {
  color: string;
  polygonPoints: string;
  angleDeg: number;
}

export interface RosetteSvgData {
  cx: number;
  cy: number;
  title: string;
  tails: RosetteSvgTail[];
  tiers: RosetteSvgTier[];
  badgeRadius: number;
  badgeLabel: string;
  badgeFontSize: number;
  line1: string;
  line2: string;
  line3: string;
}

export function buildRosetteSvgData(res: RosetteOkResult): RosetteSvgData {
  const cx = 240;
  const cy = 250;
  const scale = 360 / res.oMaxMm;

  const tails: RosetteSvgTail[] = [];
  if (res.tc > 0) {
    const tailW = 0.6 * res.tiers[0].w * scale;
    const hw = tailW / 2;
    const notch = Math.min(tailW * 0.55, 22);
    const yTop = cy;
    const yBot = 500;
    const tailColor = res.tiers[0].c;
    const points = [
      `${(cx - hw).toFixed(1)},${yTop}`,
      `${(cx + hw).toFixed(1)},${yTop}`,
      `${(cx + hw).toFixed(1)},${yBot}`,
      `${cx.toFixed(1)},${(yBot - notch).toFixed(1)}`,
      `${(cx - hw).toFixed(1)},${yBot}`,
    ].join(' ');
    for (let j = 0; j < res.tc; j++) {
      const angleDeg = (j - (res.tc - 1) / 2) * 12;
      tails.push({ color: tailColor, polygonPoints: points, angleDeg });
    }
  }

  // Draw widest tier first so narrower tiers remain visible on top.
  const orderedTiers = [...res.tiers].sort((a, b) => {
    if (b.oMm !== a.oMm) return b.oMm - a.oMm;
    return a.tier - b.tier;
  });

  const nPrime = res.svgPleats;
  const rInner = (res.pMm / 2) * scale;
  const tiers: RosetteSvgTier[] = orderedTiers.map((t) => {
    const rOuter = (t.oMm / 2) * scale;
    const rValley = 0.95 * rOuter;
    const pts: string[] = [];
    const foldLines: { x1: number; y1: number; x2: number; y2: number }[] = [];

    for (let k = 0; k < 2 * nPrime; k++) {
      const theta = (k * Math.PI) / nPrime - Math.PI / 2;
      const r = k % 2 === 0 ? rOuter : rValley;
      const x = cx + r * Math.cos(theta);
      const y = cy + r * Math.sin(theta);
      pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
      if (k % 2 === 0) {
        foldLines.push({
          x1: Number((cx + rInner * Math.cos(theta)).toFixed(1)),
          y1: Number((cy + rInner * Math.sin(theta)).toFixed(1)),
          x2: Number(x.toFixed(1)),
          y2: Number(y.toFixed(1)),
        });
      }
    }

    return {
      tier: t.tier,
      color: t.c,
      polygonPoints: pts.join(' '),
      foldLines,
    };
  });

  const badgeRadius = Number(((res.b / 2) * scale).toFixed(1));
  const badgeFontSize = Math.max(12, Math.min(20, Math.round(badgeRadius * 0.42)));

  const line1 = `台紙 直径${res.pCmStr}cm ／ 仕上がり 直径約${res.oMaxCmStr}cm`;
  const line2 = `リボン ${res.tiers.map((t) => `${fmtNum(t.w)}mm幅 ${t.buyCm}cm`).join('・')}`;
  let line3 = '既製プリーツリボン';
  if (res.f === 'h') {
    line3 = `ひだ${res.pleats}個（間隔${fmtNum(res.s!)}mm・深さ${fmtNum(res.d!)}mm）`;
  } else if (res.f === 't') {
    line3 = `試し折り ${res.kStr}倍`;
  }

  return {
    cx,
    cy,
    title: `${fmtNum(res.b)}mm缶バッジ・${res.n}段ロゼット`,
    tails,
    tiers,
    badgeRadius,
    badgeLabel: `${fmtNum(res.b)}mm`,
    badgeFontSize,
    line1,
    line2,
    line3,
  };
}

/** Round up to whole 10 cm for buying ribbon at a shop. */
export function roundUp10Cm(cm: number): number {
  const clean = Math.round(cm * 1000) / 1000;
  return Math.ceil(clean / 10) * 10;
}

export interface PatternSheetData {
  sheetW: number;
  sheetH: number;
  cx: number;
  cy: number;
  mountRadius: number;
  badgeRadius: number | null;
  glueRadius: number | null;
  showInnerLabel: boolean;
}

/** Geometry in millimetres (1 user unit = 1 mm) for the full-size printable 台紙 sheet. */
export function buildPatternSheetData(res: RosetteOkResult): PatternSheetData {
  const rawW = Math.ceil(res.pMm + 20);
  const sheetW =
    res.pMm <= 160 ? Math.max(100, rawW) : res.pMm <= 176 ? 180 : Math.ceil(res.pMm + 6);
  const sheetH = sheetW + 14;
  const cx = Number((sheetW / 2).toFixed(2));
  const cy = cx;
  const mountRadius = Number((res.pMm / 2).toFixed(2));
  const badgeRadius = res.m >= 2 ? Number((res.b / 2).toFixed(2)) : null;
  const rawGlueR = res.pMm / 2 - res.g;
  const glueRadius =
    rawGlueR >= 5 && (badgeRadius === null || Math.abs(rawGlueR - badgeRadius) >= 2)
      ? Number(rawGlueR.toFixed(2))
      : null;
  const innermostGuideR = glueRadius ?? badgeRadius ?? mountRadius;
  const showInnerLabel = innermostGuideR >= 22;

  return {
    sheetW,
    sheetH,
    cx,
    cy,
    mountRadius,
    badgeRadius,
    glueRadius,
    showInnerLabel,
  };
}

function applyTpl(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
}

export interface RosetteInstructions {
  materials: string[];
  steps: string[];
  patternLegend: string;
}

/** Build the shopping list, making steps in order, and pattern legend from UI templates. */
export function buildInstructions(
  res: RosetteOkResult,
  pattern: PatternSheetData,
  ui: Record<string, string>,
): RosetteInstructions {
  const bStr = fmtNum(res.b);
  const pMmStr = fmtNum(res.pMm);
  const gStr = fmtNum(res.g);

  const materials: string[] = res.tiers.map((t) =>
    applyTpl(ui.materialsTierTpl, {
      i: t.tier,
      w: fmtNum(t.w),
      shopCm: roundUp10Cm(t.buyCm),
    }),
  );
  if (res.tc > 0) {
    materials.push(
      applyTpl(ui.materialsTailTpl, {
        shopCm: roundUp10Cm(res.tailTotalCm),
        tl: fmtNum(res.tl),
        tc: res.tc,
      }),
    );
  }
  materials.push(applyTpl(ui.materialsMountTpl, { P: res.pCmStr, pMm: pMmStr }));
  materials.push(applyTpl(ui.materialsBadgeTpl, { b: bStr }));
  materials.push(ui.materialsGlue);

  const steps: string[] = [applyTpl(ui.stepCutMountTpl, { P: res.pCmStr, pMm: pMmStr })];
  for (const t of res.tiers) {
    const wStr = fmtNum(t.w);
    if (res.f === 'h') {
      steps.push(
        applyTpl(ui.stepFoldHandTpl, {
          i: t.tier,
          w: wStr,
          buy: t.buyCm,
          s: fmtNum(res.s!),
          d: fmtNum(res.d!),
          pleats: res.pleats!,
          L: t.lCmStr,
        }),
      );
    } else if (res.f === 't') {
      steps.push(
        applyTpl(ui.stepFoldTestTpl, {
          i: t.tier,
          w: wStr,
          buy: t.buyCm,
          k: res.kStr,
          L: t.lCmStr,
        }),
      );
    } else {
      steps.push(
        applyTpl(ui.stepFoldPreTpl, {
          i: t.tier,
          w: wStr,
          buy: t.buyCm,
          L: t.lCmStr,
        }),
      );
    }
  }

  if (res.n === 1) {
    steps.push(applyTpl(ui.stepAssembleSingleTpl, { g: gStr }));
  } else {
    const lastTier = res.tiers[res.tiers.length - 1];
    steps.push(
      applyTpl(ui.stepAssembleMultiTpl, {
        n: res.n,
        w1: fmtNum(res.tiers[0].w),
        wLast: fmtNum(lastTier.w),
        g: gStr,
      }),
    );
  }

  if (res.tc > 0) {
    steps.push(
      applyTpl(ui.stepFinishWithTailsTpl, {
        tl: fmtNum(res.tl),
        tc: res.tc,
        b: bStr,
        Omax: res.oMaxCmStr,
      }),
    );
  } else {
    steps.push(
      applyTpl(ui.stepFinishNoTailsTpl, {
        b: bStr,
        Omax: res.oMaxCmStr,
      }),
    );
  }

  const legendParts = [ui.patternLegendCut];
  if (pattern.badgeRadius !== null) {
    legendParts.push(applyTpl(ui.patternLegendBadgeTpl, { b: bStr }));
  }
  if (pattern.glueRadius !== null) {
    legendParts.push(applyTpl(ui.patternLegendGlueTpl, { g: gStr }));
  }

  return {
    materials,
    steps,
    patternLegend: legendParts.join('　'),
  };
}
