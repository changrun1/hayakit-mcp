export type InputMode = 'len' | 'holes';

export interface RowInput {
  name: string;
  mode: InputMode;
  val: string;
  t: string;
  qty: string;
}

export interface ToolInput {
  p: string;
  k: string; // '0.85' | '1.00'
  bs: string;
  be: string;
  tail: string;
  sl: string;
  sp: string;
  rows: RowInput[];
}

export interface RowError {
  val?: string;
  t?: string;
  qty?: string;
}

export interface ValidationErrors {
  p?: string;
  bs?: string;
  be?: string;
  tail?: string;
  sl?: string;
  sp?: string;
  rows: RowError[];
}

export interface RowResult {
  index: number;
  name: string;
  mode: InputMode;
  seamLenCm: number;
  tMm: number;
  qty: number;
  intervals: number;
  holes: number;
  totalIntervals: number;
  stitchCm: number;
  cutCm: number;
  rowTotalCm: number;
  longWarning: boolean;
}

export interface CalcResult {
  pMm: number;
  spi: string;
  k: number;
  bs: number;
  be: number;
  tailCm: number;
  slM: number | null;
  spNtd: number | null;
  rows: RowResult[];
  totalCm: number;
  totalM: string;
  totalHoles: number;
  totalIntervals: number;
  totalSeamLenCm: number;
  multiplier: string;
  anyLongWarning: boolean;
  threadRec: string;
  spools: number | null;
  costNtd: string | null;
}

export type CalcOutput =
  | { status: 'empty'; errors: ValidationErrors }
  | { status: 'invalid'; errors: ValidationErrors }
  | { status: 'valid'; errors: ValidationErrors; result: CalcResult };

export const LONG_SEAM_CM = 150;
export const MAX_ROWS = 20;

export const PITCH_PRESETS: { kind: 'french' | 'diamond'; value: string }[] = [
  { kind: 'french', value: '2.7' },
  { kind: 'french', value: '3.0' },
  { kind: 'french', value: '3.38' },
  { kind: 'french', value: '3.85' },
  { kind: 'diamond', value: '4.0' },
  { kind: 'diamond', value: '5.0' },
  { kind: 'diamond', value: '6.0' },
];

export const EMPTY_ROW: RowInput = {
  name: '',
  mode: 'len',
  val: '',
  t: '3.0',
  qty: '1',
};

export const DEFAULT_INPUT: ToolInput = {
  p: '3.38',
  k: '0.85',
  bs: '2',
  be: '2',
  tail: '15',
  sl: '',
  sp: '',
  rows: [{ ...EMPTY_ROW }],
};

export const SHORT_WALLET_ROWS: RowInput[] = [
  { name: '外皮邊緣', mode: 'len', val: '42', t: '3.2', qty: '1' },
  { name: '卡層側邊', mode: 'len', val: '10', t: '2.0', qty: '2' },
  { name: '鈔票隔層', mode: 'len', val: '20', t: '2.4', qty: '1' },
];

export const CARD_HOLDER_ROWS: RowInput[] = [
  { name: '外緣Ｕ字縫線', mode: 'len', val: '27', t: '2.8', qty: '1' },
  { name: '卡片隔層邊緣', mode: 'len', val: '10', t: '1.8', qty: '2' },
];

export const PASSPORT_COVER_ROWS: RowInput[] = [
  { name: '外皮上下邊緣', mode: 'len', val: '28', t: '2.6', qty: '1' },
  { name: '內頁夾層側邊', mode: 'len', val: '14', t: '2.2', qty: '2' },
];

export const EXAMPLE_INPUT: ToolInput = {
  p: '3.38',
  k: '0.85',
  bs: '2',
  be: '2',
  tail: '15',
  sl: '285',
  sp: '900',
  rows: SHORT_WALLET_ROWS.map((r) => ({ ...r })),
};

export const ERR_MSG = {
  p: '斬距請輸入 1.0～15.0 mm',
  bs: '回針數請輸入 0～10 的整數',
  be: '回針數請輸入 0～10 的整數',
  tail: '預留長度請輸入 0～50 cm',
  valLen: '縫線長度請輸入 0.1～500 cm',
  valHoles: '針孔數請輸入 2～2000 的整數',
  t: '皮厚請輸入 0.2～30.0 mm',
  qty: '段數請輸入 1～50 的整數',
  sl: '捲長請輸入 1～5000 m',
  sp: '價格請輸入 0～50000 的整數',
} as const;

/** Normalize NFKC full-width digits/dots and strip whitespace and commas. */
export function normalizeNumStr(raw: string): string {
  return raw.normalize('NFKC').replace(/,/g, '').trim();
}

function parseDecimal(raw: string, min: number, max: number): number | null {
  const s = normalizeNumStr(raw);
  if (!/^-?(\d+(\.\d*)?|\.\d+)$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

function parseIntRange(raw: string, min: number, max: number): number | null {
  const s = normalizeNumStr(raw);
  if (!/^-?\d+$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isSafeInteger(n) || n < min || n > max) return null;
  return n;
}

/** Fil Au Chinois thread gauge recommendation by chisel pitch (mm). */
export function recommendThreadGauge(pMm: number): string {
  if (pMm <= 3.0) return '#832（0.43 mm）／#632（0.51 mm）';
  if (pMm <= 3.5) return '#632（0.51 mm）／#532（0.57 mm）';
  if (pMm < 4.0) return '#532（0.57 mm）／#432（0.63 mm）';
  return '#432（0.63 mm）／#332（0.77 mm）';
}

/** Validate all inputs and compute saddle-stitch thread lengths, holes, spools, and cost. */
export function calculateLeatherThread(input: ToolInput): CalcOutput {
  const errors: ValidationErrors = {
    rows: input.rows.map(() => ({})),
  };

  const pMm = parseDecimal(input.p, 1.0, 15.0);
  if (pMm === null) errors.p = ERR_MSG.p;

  const bs = parseIntRange(input.bs, 0, 10);
  if (bs === null) errors.bs = ERR_MSG.bs;

  const be = parseIntRange(input.be, 0, 10);
  if (be === null) errors.be = ERR_MSG.be;

  const tailCm = parseDecimal(input.tail, 0, 50);
  if (tailCm === null) errors.tail = ERR_MSG.tail;

  const slRaw = normalizeNumStr(input.sl);
  let slM: number | null = null;
  if (slRaw !== '') {
    slM = parseDecimal(slRaw, 1, 5000);
    if (slM === null) errors.sl = ERR_MSG.sl;
  }

  const spRaw = normalizeNumStr(input.sp);
  let spNtd: number | null = null;
  if (spRaw !== '') {
    spNtd = parseIntRange(spRaw, 0, 50000);
    if (spNtd === null) errors.sp = ERR_MSG.sp;
  }

  const k = input.k === '1.00' || input.k === '1' ? 1.0 : 0.85;

  let hasAnyError = Boolean(errors.p || errors.bs || errors.be || errors.tail || errors.sl || errors.sp);

  const parsedRows: {
    index: number;
    name: string;
    mode: InputMode;
    val: number;
    tMm: number;
    qty: number;
  }[] = [];

  for (let i = 0; i < input.rows.length; i++) {
    const r = input.rows[i];
    const rowErr: RowError = {};
    const valRaw = normalizeNumStr(r.val);

    const tMm = parseDecimal(r.t, 0.2, 30.0);
    if (tMm === null) rowErr.t = ERR_MSG.t;

    const qty = parseIntRange(r.qty, 1, 50);
    if (qty === null) rowErr.qty = ERR_MSG.qty;

    let valNum: number | null = null;
    if (valRaw !== '') {
      if (r.mode === 'holes') {
        valNum = parseIntRange(valRaw, 2, 2000);
        if (valNum === null) rowErr.val = ERR_MSG.valHoles;
      } else {
        valNum = parseDecimal(valRaw, 0.1, 500);
        if (valNum === null) rowErr.val = ERR_MSG.valLen;
      }
    }

    errors.rows[i] = rowErr;
    if (rowErr.val || rowErr.t || rowErr.qty) {
      hasAnyError = true;
    } else if (valNum !== null && tMm !== null && qty !== null) {
      parsedRows.push({
        index: i,
        name: r.name.trim() || `部位 ${i + 1}`,
        mode: r.mode,
        val: valNum,
        tMm,
        qty,
      });
    }
  }

  if (hasAnyError) {
    return { status: 'invalid', errors };
  }

  if (parsedRows.length === 0) {
    return { status: 'empty', errors };
  }

  // All global params are non-null because !hasAnyError
  const p = pMm!;
  const backStart = bs!;
  const backEnd = be!;
  const tail = tailCm!;

  const rowResults: RowResult[] = parsedRows.map((r) => {
    let intervals: number;
    let holes: number;
    let seamLenCm: number;
    if (r.mode === 'len') {
      intervals = Math.ceil((r.val * 10) / p - 1e-9);
      holes = intervals + 1;
      seamLenCm = r.val;
    } else {
      holes = Math.round(r.val);
      intervals = Math.max(1, holes - 1);
      seamLenCm = (intervals * p) / 10;
    }

    const totalIntervals = intervals + backStart + backEnd;
    const stitchCm = (totalIntervals * 2 * (p + r.tMm) * k) / 10;
    const cutCm = Math.ceil(stitchCm + 2 * tail - 1e-9);
    const rowTotalCm = cutCm * r.qty;
    const longWarning = cutCm > LONG_SEAM_CM;

    return {
      index: r.index,
      name: r.name,
      mode: r.mode,
      seamLenCm,
      tMm: r.tMm,
      qty: r.qty,
      intervals,
      holes,
      totalIntervals,
      stitchCm,
      cutCm,
      rowTotalCm,
      longWarning,
    };
  });

  const totalCm = rowResults.reduce((sum, r) => sum + r.rowTotalCm, 0);
  const totalM = (totalCm / 100).toFixed(2);
  const totalHoles = rowResults.reduce((sum, r) => sum + r.holes * r.qty, 0);
  const totalIntervals = rowResults.reduce((sum, r) => sum + r.intervals * r.qty, 0);
  const totalSeamLenCm = rowResults.reduce((sum, r) => sum + r.seamLenCm * r.qty, 0);
  const multiplier = totalSeamLenCm > 0 ? (totalCm / totalSeamLenCm).toFixed(2) : '0.00';
  const anyLongWarning = rowResults.some((r) => r.longWarning);
  const threadRec = recommendThreadGauge(p);
  const spi = (25.4 / p).toFixed(2);

  const spools = slM !== null && slM > 0 ? Math.ceil(totalCm / 100 / slM) : null;
  const costNtd = slM !== null && slM > 0 && spNtd !== null ? ((totalCm / 100) * (spNtd / slM)).toFixed(1) : null;

  return {
    status: 'valid',
    errors,
    result: {
      pMm: p,
      spi,
      k,
      bs: backStart,
      be: backEnd,
      tailCm: tail,
      slM,
      spNtd,
      rows: rowResults,
      totalCm,
      totalM,
      totalHoles,
      totalIntervals,
      totalSeamLenCm,
      multiplier,
      anyLongWarning,
      threadRec,
      spools,
      costNtd,
    },
  };
}

/** Build plain-text cut checklist for clipboard copy. */
export function buildCutListText(res: CalcResult, url: string): string {
  const lines: string[] = [
    `【皮革手縫裁線清單】`,
    `斬距：${res.pMm} mm（${res.spi} SPI）｜係數 k=${res.k}｜回針：${res.bs}+${res.be}｜穿針預留：${res.tailCm} cm×2`,
    `建議線徑：法薩琳 ${res.threadRec}`,
    ``,
  ];
  for (const r of res.rows) {
    const qtyStr = r.qty > 1 ? ` × ${r.qty} 段 = ${r.rowTotalCm} cm` : '';
    const warnStr = r.longWarning ? '（建議分段）' : '';
    lines.push(`- ${r.name}：單段裁 ${r.cutCm} cm${qtyStr}（${r.holes} 孔 / 皮厚 ${r.tMm} mm）${warnStr}`);
  }
  lines.push(``);
  lines.push(`總計：${res.totalM} m（${res.totalCm} cm）／共 ${res.totalHoles} 針孔`);
  if (res.spools !== null) {
    lines.push(`需準備捲數：${res.spools} 捲（每捲 ${res.slM} m）`);
  }
  if (res.costNtd !== null) {
    lines.push(`預估線材成本：NT$ ${res.costNtd}`);
  }
  if (url) {
    lines.push(url);
  }
  return lines.join('\n');
}

function isDefaultEmptyState(input: ToolInput): boolean {
  return (
    normalizeNumStr(input.p) === DEFAULT_INPUT.p &&
    (input.k === '0.85' || input.k === '') &&
    normalizeNumStr(input.bs) === DEFAULT_INPUT.bs &&
    normalizeNumStr(input.be) === DEFAULT_INPUT.be &&
    normalizeNumStr(input.tail) === DEFAULT_INPUT.tail &&
    normalizeNumStr(input.sl) === '' &&
    normalizeNumStr(input.sp) === '' &&
    input.rows.length === 1 &&
    input.rows[0].name.trim() === '' &&
    input.rows[0].mode === 'len' &&
    normalizeNumStr(input.rows[0].val) === '' &&
    normalizeNumStr(input.rows[0].t) === EMPTY_ROW.t &&
    normalizeNumStr(input.rows[0].qty) === EMPTY_ROW.qty
  );
}

/** Encode ToolInput into compact URL query params. */
export function toQueryState(input: ToolInput): Record<string, string> {
  if (isDefaultEmptyState(input)) return {};

  const out: Record<string, string> = {};
  const p = normalizeNumStr(input.p);
  if (p) out.p = p;

  if (input.k === '1.00' || input.k === '1') out.k = '1.00';

  const bs = normalizeNumStr(input.bs);
  if (bs !== DEFAULT_INPUT.bs) out.bs = bs;

  const be = normalizeNumStr(input.be);
  if (be !== DEFAULT_INPUT.be) out.be = be;

  const tail = normalizeNumStr(input.tail);
  if (tail !== DEFAULT_INPUT.tail) out.tail = tail;

  const sl = normalizeNumStr(input.sl);
  if (sl !== '') out.sl = sl;

  const sp = normalizeNumStr(input.sp);
  if (sp !== '') out.sp = sp;

  const serializedRows = input.rows
    .slice(0, MAX_ROWS)
    .map((r) => {
      const safeName = encodeURIComponent(r.name.trim()).replace(/~/g, '%7E');
      const m = r.mode === 'holes' ? 'h' : 'l';
      const val = normalizeNumStr(r.val);
      const t = normalizeNumStr(r.t);
      const qty = normalizeNumStr(r.qty);
      return `${safeName}~${m}~${val}~${t}~${qty}`;
    })
    .join(',');

  if (serializedRows) out.r = serializedRows;
  return out;
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** Restore ToolInput from URL query params and determine which <details> should auto-open. */
export function fromQueryState(params: Record<string, string>): {
  input: ToolInput;
  openAdv: boolean;
  openCost: boolean;
} {
  const p = params.p ?? DEFAULT_INPUT.p;
  const k = params.k === '1.00' || params.k === '1' ? '1.00' : '0.85';
  const bs = params.bs ?? DEFAULT_INPUT.bs;
  const be = params.be ?? DEFAULT_INPUT.be;
  const tail = params.tail ?? DEFAULT_INPUT.tail;
  const sl = params.sl ?? '';
  const sp = params.sp ?? '';

  let rows: RowInput[] = [{ ...EMPTY_ROW }];
  if (params.r) {
    const parsed = params.r
      .split(',')
      .slice(0, MAX_ROWS)
      .map((chunk) => {
        const [rawName = '', m = 'l', val = '', t = '3.0', qty = '1'] = chunk.split('~');
        return {
          name: safeDecode(rawName),
          mode: (m === 'h' ? 'holes' : 'len') as InputMode,
          val,
          t,
          qty,
        };
      })
      .filter((r) => r.name !== '' || r.val !== '' || r.t !== '3.0' || r.qty !== '1' || r.mode !== 'len');
    if (parsed.length > 0) rows = parsed;
  }

  const openAdv =
    normalizeNumStr(bs) !== DEFAULT_INPUT.bs ||
    normalizeNumStr(be) !== DEFAULT_INPUT.be ||
    normalizeNumStr(tail) !== DEFAULT_INPUT.tail;
  const openCost = normalizeNumStr(sl) !== '' || normalizeNumStr(sp) !== '';

  return {
    input: { p, k, bs, be, tail, sl, sp, rows },
    openAdv,
    openCost,
  };
}
