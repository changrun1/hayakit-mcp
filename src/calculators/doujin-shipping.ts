export type BookFormat = 'b5' | 'a5' | 'bunko';
export type PaperType =
  | 'joshitsu70'
  | 'joshitsu90'
  | 'comic'
  | 'shoseki62'
  | 'shoseki90'
  | 'matte90';
export type PackagingType = 'card2' | 'card1' | 'opp' | 'cushion' | 'box';
export type SideBySideMode = 'auto' | 'stack';

export interface BoundedRange {
  min: number;
  max: number;
}

export const BOOK_PAGE_RANGE: BoundedRange = { min: 4, max: 1000 };
export const BOOK_QTY_RANGE: BoundedRange = { min: 1, max: 100 };
export const THICKNESS_RANGE: BoundedRange = { min: 0, max: 100 };
export const WEIGHT_RANGE: BoundedRange = { min: 0, max: 5000 };
export const PAPER_THICKNESS_RANGE: BoundedRange = { min: 0.03, max: 0.5 };

export const FORMAT_AREAS: Record<BookFormat, number> = {
  b5: 0.046774,
  a5: 0.03108,
  bunko: 0.01554,
};

export const FORMAT_DIMS_MM: Record<BookFormat, { w: number; h: number; label: string }> = {
  b5: { w: 182, h: 257, label: 'B5' },
  a5: { w: 148, h: 210, label: 'A5' },
  bunko: { w: 105, h: 148, label: '文庫' },
};

export interface PaperSpec {
  thickness: number;
  gsm: number;
}

export const PAPER_SPECS: Record<PaperType, PaperSpec> = {
  joshitsu70: { thickness: 0.091, gsm: 81.4 },
  joshitsu90: { thickness: 0.117, gsm: 104.7 },
  comic: { thickness: 0.143, gsm: 100.0 },
  shoseki62: { thickness: 0.089, gsm: 72.1 },
  shoseki90: { thickness: 0.118, gsm: 104.7 },
  matte90: { thickness: 0.1, gsm: 104.7 },
};

export interface PackagingSpec {
  thickness: number;
  weight: number;
}

export const PACKAGING_SPECS: Record<PackagingType, PackagingSpec> = {
  card2: { thickness: 2.5, weight: 50 },
  card1: { thickness: 1.5, weight: 30 },
  opp: { thickness: 0.5, weight: 8 },
  cushion: { thickness: 4.0, weight: 45 },
  box: { thickness: 3.0, weight: 85 },
};

export const COVER_THICKNESS_MM = 0.6;
export const COVER_GSM = 209.3;

export type ParsedNumber =
  | { status: 'empty' }
  | { status: 'valid'; value: number }
  | { status: 'invalid' };

export function parseBoundedInt(raw: string, range: BoundedRange): ParsedNumber {
  const normalized = raw.normalize('NFKC').replace(/,/g, '').trim();
  if (normalized === '') return { status: 'empty' };
  if (!/^\d+$/.test(normalized)) return { status: 'invalid' };
  const value = Number(normalized);
  if (!Number.isSafeInteger(value) || value < range.min || value > range.max) {
    return { status: 'invalid' };
  }
  return { status: 'valid', value };
}

export function parseBoundedFloat(raw: string, range: BoundedRange): ParsedNumber {
  const normalized = raw.normalize('NFKC').replace(/,/g, '').trim();
  if (normalized === '') return { status: 'empty' };
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return { status: 'invalid' };
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < range.min || value > range.max) {
    return { status: 'invalid' };
  }
  return { status: 'valid', value };
}

export function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

export interface BookRowInput {
  format: BookFormat;
  pages: number;
  paper: PaperType;
  qty: number;
}

export interface CalcParams {
  books: BookRowInput[];
  goodsThickness?: number;
  goodsWeight?: number;
  sideBySide?: SideBySideMode;
  packaging?: PackagingType;
  paperThicknessOverride?: number | null;
  pkgThicknessOverride?: number | null;
  pkgWeightOverride?: number | null;
}

export interface BookRowDetail {
  index: number;
  format: BookFormat;
  pages: number;
  paper: PaperType;
  qty: number;
  tBook: number;
  wBook: number;
}

interface CopyItem {
  rowIndex: number;
  format: BookFormat;
  tBook: number;
  wBook: number;
}

export interface ColumnStack {
  copies: CopyItem[];
  heightMm: number;
}

export type ShippingTierId =
  | 'smartletter'
  | 'clickpost'
  | 'yupacket_post_booth'
  | 'nekopos_booth'
  | 'yupacket_booth'
  | 'yupacket_jp'
  | 'letterpack_light'
  | 'yupacket_plus_booth'
  | 'letterpack_plus';

export type TierStatus = 'best' | 'ok' | 'warn' | 'ng';

export interface ShippingTierResult {
  id: ShippingTierId;
  name: string;
  price: number;
  priceText: string;
  limitText: string;
  passes: boolean;
  isPostDrop3cm: boolean;
  isTight: boolean;
  status: TierStatus;
  reason: string;
}

export interface TwoPackSide {
  copiesCount: number;
  tTotal: number;
  wTotal: number;
  cols: 1 | 2 | 4;
}

export interface TwoPackSplitResult {
  valid: boolean;
  pack1: TwoPackSide;
  pack2: TwoPackSide;
}

export type VerdictKind = 'ok' | 'warn_tight' | 'warn_weight_light' | 'no';
export type AdviceKind =
  | 'none'
  | 'enable_side_by_side'
  | 'use_yupacket_plus'
  | 'use_two_pack'
  | 'use_letterpack_plus'
  | 'over_4kg';

export interface CalcResult {
  totalCopies: number;
  hasB5: boolean;
  allBunko: boolean;
  cols: 1 | 2 | 4;
  colStacks: ColumnStack[];
  maxColIndex: number;
  tBooks: number;
  tBooksSingle: number;
  tGoods: number;
  wGoods: number;
  tPkg: number;
  wPkg: number;
  tTotal: number;
  tSingleTotal: number;
  wTotal: number;
  margin: number;
  bookDetails: BookRowDetail[];
  tiers: ShippingTierResult[];
  cheapest: ShippingTierResult | null;
  verdict: VerdictKind;
  advice: AdviceKind;
  autoFits3cm: boolean;
  twoPackSplit: TwoPackSplitResult | null;
}

export const EXAMPLE_STATE = {
  books: [
    { format: 'b5' as BookFormat, pages: '36', paper: 'joshitsu90' as PaperType, qty: '3' },
    { format: 'b5' as BookFormat, pages: '60', paper: 'joshitsu90' as PaperType, qty: '1' },
  ],
  gt: '',
  gw: '',
  sb: 'auto' as SideBySideMode,
  pkg: 'card2' as PackagingType,
  pt: '',
  pkgt: '',
  pkgw: '',
};

export function computeBookMetrics(
  format: BookFormat,
  pages: number,
  paper: PaperType,
  paperThicknessOverride?: number | null,
): { tBook: number; wBook: number } {
  const area = FORMAT_AREAS[format];
  const spec = PAPER_SPECS[paper];
  const tSheet = paperThicknessOverride ?? spec.thickness;
  const sheets = (pages - 4) / 2;
  const tBook = sheets * tSheet + COVER_THICKNESS_MM;
  const wBook = sheets * area * spec.gsm + 2 * area * COVER_GSM;
  return { tBook, wBook };
}

function greedyStack(copies: CopyItem[], cols: 1 | 2 | 4): ColumnStack[] {
  const stacks: ColumnStack[] = Array.from({ length: cols }, () => ({
    copies: [],
    heightMm: 0,
  }));
  const sorted = [...copies].sort((a, b) => b.tBook - a.tBook);
  for (const copy of sorted) {
    let minIdx = 0;
    for (let c = 1; c < cols; c++) {
      if (stacks[c].heightMm < stacks[minIdx].heightMm) {
        minIdx = c;
      }
    }
    stacks[minIdx].copies.push(copy);
    stacks[minIdx].heightMm += copy.tBook;
  }
  return stacks;
}

function resolveCols(copies: CopyItem[], sb: SideBySideMode): 1 | 2 | 4 {
  if (copies.length === 0) return 1;
  const hasB5 = copies.some((c) => c.format === 'b5');
  if (hasB5 || sb === 'stack') return 1;
  const allBunko = copies.every((c) => c.format === 'bunko');
  return allBunko ? 4 : 2;
}

function computeTwoPackSplit(
  copies: CopyItem[],
  sb: SideBySideMode,
  tGoods: number,
  wGoods: number,
  tPkg: number,
  wPkg: number,
): TwoPackSplitResult {
  const sorted = [...copies].sort((a, b) => b.tBook - a.tBook);
  const pack1Copies: CopyItem[] = [];
  const pack2Copies: CopyItem[] = [];
  let sum1 = tGoods;
  let sum2 = 0;

  for (const copy of sorted) {
    if (sum1 <= sum2) {
      pack1Copies.push(copy);
      sum1 += copy.tBook;
    } else {
      pack2Copies.push(copy);
      sum2 += copy.tBook;
    }
  }

  const evalPack = (items: CopyItem[], gT: number, gW: number): TwoPackSide => {
    const pCols = resolveCols(items, sb);
    const stacks = greedyStack(items, pCols);
    const tBooks = stacks.reduce((m, s) => Math.max(m, s.heightMm), 0);
    const wBooks = items.reduce((s, c) => s + c.wBook, 0);
    return {
      copiesCount: items.length,
      tTotal: round1(tBooks + gT + tPkg),
      wTotal: Math.round(wBooks + gW + wPkg),
      cols: pCols,
    };
  };

  const pack1 = evalPack(pack1Copies, tGoods, wGoods);
  const pack2 = evalPack(pack2Copies, 0, 0);
  const valid =
    pack1.copiesCount > 0 &&
    pack2.copiesCount > 0 &&
    pack1.tTotal <= 30.0 &&
    pack1.wTotal <= 2000 &&
    pack2.tTotal <= 30.0 &&
    pack2.wTotal <= 2000;

  return { valid, pack1, pack2 };
}

export function calculate(params: CalcParams): CalcResult {
  const sb: SideBySideMode = params.sideBySide ?? 'auto';
  const pkgType: PackagingType = params.packaging ?? 'card2';
  const pkgSpec = PACKAGING_SPECS[pkgType];
  const tPkg = params.pkgThicknessOverride ?? pkgSpec.thickness;
  const wPkg = params.pkgWeightOverride ?? pkgSpec.weight;
  const tGoods = params.goodsThickness ?? 0;
  const wGoods = params.goodsWeight ?? 0;
  const ptOverride = params.paperThicknessOverride ?? null;

  const bookDetails: BookRowDetail[] = [];
  const allCopies: CopyItem[] = [];

  params.books.forEach((b, idx) => {
    const { tBook, wBook } = computeBookMetrics(b.format, b.pages, b.paper, ptOverride);
    bookDetails.push({
      index: idx + 1,
      format: b.format,
      pages: b.pages,
      paper: b.paper,
      qty: b.qty,
      tBook,
      wBook,
    });
    for (let q = 0; q < b.qty; q++) {
      allCopies.push({
        rowIndex: idx + 1,
        format: b.format,
        tBook,
        wBook,
      });
    }
  });

  const totalCopies = allCopies.length;
  const hasB5 = allCopies.some((c) => c.format === 'b5');
  const allBunko = totalCopies > 0 && allCopies.every((c) => c.format === 'bunko');
  const cols = resolveCols(allCopies, sb);

  const colStacks = greedyStack(allCopies, cols);
  let maxColIndex = 0;
  for (let i = 1; i < colStacks.length; i++) {
    if (colStacks[i].heightMm > colStacks[maxColIndex].heightMm) {
      maxColIndex = i;
    }
  }
  const tBooks = colStacks[maxColIndex]?.heightMm ?? 0;
  const tBooksSingle = allCopies.reduce((s, c) => s + c.tBook, 0);

  const tTotal = round1(tBooks + tGoods + tPkg);
  const tSingleTotal = round1(tBooksSingle + tGoods + tPkg);
  const wTotal = Math.round(allCopies.reduce((s, c) => s + c.wBook, 0) + wGoods + wPkg);
  const margin = round1(30.0 - tTotal);

  const isTightZone = tTotal >= 28.0 && tTotal <= 30.0;

  const rawTiers: Omit<ShippingTierResult, 'status' | 'isTight'>[] = [
    {
      id: 'smartletter',
      name: 'スマートレター',
      price: 210,
      priceText: '210円',
      limitText: '25×17cm・2cm・1kg',
      passes: !hasB5 && tSingleTotal <= 20.0 && wTotal <= 1000,
      isPostDrop3cm: false,
      reason: hasB5
        ? 'B5非対応'
        : tSingleTotal > 20.0 && wTotal > 1000
          ? '2cm・1kg超'
          : tSingleTotal > 20.0
            ? '2cm超'
            : wTotal > 1000
              ? '1kg超'
              : '',
    },
    {
      id: 'clickpost',
      name: 'クリックポスト',
      price: 240,
      priceText: '240円',
      limitText: '34×25cm・3cm・2kg',
      passes: tTotal <= 30.0 && wTotal <= 2000,
      isPostDrop3cm: true,
      reason:
        tTotal > 30.0 && wTotal > 2000
          ? '3cm・2kg超'
          : tTotal > 30.0
            ? '3cm超'
            : wTotal > 2000
              ? '2kg超'
              : '',
    },
    {
      id: 'yupacket_post_booth',
      name: 'ゆうパケットポスト（BOOTH）',
      price: 255,
      priceText: '255円',
      limitText: '3辺60cm・目安3cm・2kg',
      passes: tTotal <= 30.0 && wTotal <= 2000,
      isPostDrop3cm: true,
      reason:
        tTotal > 30.0 && wTotal > 2000
          ? '3cm・2kg超'
          : tTotal > 30.0
            ? '3cm超'
            : wTotal > 2000
              ? '2kg超'
              : '',
    },
    {
      id: 'nekopos_booth',
      name: 'ネコポス（BOOTH）',
      price: 270,
      priceText: '270円',
      limitText: '3辺60cm・3cm・1kg',
      passes: tTotal <= 30.0 && wTotal <= 1000,
      isPostDrop3cm: false,
      reason:
        tTotal > 30.0 && wTotal > 1000
          ? '3cm・1kg超'
          : tTotal > 30.0
            ? '3cm超'
            : wTotal > 1000
              ? '1kg超'
              : '',
    },
    {
      id: 'yupacket_booth',
      name: 'ゆうパケット（BOOTH）',
      price: 270,
      priceText: '270円',
      limitText: '3辺60cm・3cm・1kg',
      passes: tTotal <= 30.0 && wTotal <= 1000,
      isPostDrop3cm: true,
      reason:
        tTotal > 30.0 && wTotal > 1000
          ? '3cm・1kg超'
          : tTotal > 30.0
            ? '3cm超'
            : wTotal > 1000
              ? '1kg超'
              : '',
    },
    {
      id: 'yupacket_jp',
      name: 'ゆうパケット（日本郵便・通常）',
      price: 360,
      priceText: '360円',
      limitText: '3辺60cm・3cm・1kg',
      passes: tTotal <= 30.0 && wTotal <= 1000,
      isPostDrop3cm: true,
      reason:
        tTotal > 30.0 && wTotal > 1000
          ? '3cm・1kg超'
          : tTotal > 30.0
            ? '3cm超'
            : wTotal > 1000
              ? '1kg超'
              : '',
    },
    {
      id: 'letterpack_light',
      name: 'レターパックライト',
      price: 430,
      priceText: '430円',
      limitText: '34×24.8cm・3cm・4kg',
      passes: tTotal <= 30.0 && wTotal <= 4000,
      isPostDrop3cm: true,
      reason:
        tTotal > 30.0 && wTotal > 4000
          ? '3cm・4kg超'
          : tTotal > 30.0
            ? '3cm超'
            : wTotal > 4000
              ? '4kg超'
              : '',
    },
    {
      id: 'yupacket_plus_booth',
      name: 'ゆうパケットプラス（BOOTH）',
      price: 465,
      priceText: '465円',
      limitText: '24×17×7cm・2kg',
      passes: !hasB5 && tSingleTotal <= 70.0 && wTotal <= 2000,
      isPostDrop3cm: false,
      reason: hasB5
        ? 'B5非対応'
        : tSingleTotal > 70.0 && wTotal > 2000
          ? '7cm・2kg超'
          : tSingleTotal > 70.0
            ? '7cm超'
            : wTotal > 2000
              ? '2kg超'
              : '',
    },
    {
      id: 'letterpack_plus',
      name: 'レターパックプラス',
      price: 600,
      priceText: '600円',
      limitText: '34×24.8cm・厚制限なし・4kg',
      passes: wTotal <= 4000,
      isPostDrop3cm: false,
      reason: wTotal > 4000 ? '4kg超' : '',
    },
  ];

  let cheapestId: ShippingTierId | null = null;
  for (const t of rawTiers) {
    if (t.passes) {
      cheapestId = t.id;
      break;
    }
  }

  const tiers: ShippingTierResult[] = rawTiers.map((t) => {
    const isTight = t.passes && t.isPostDrop3cm && isTightZone;
    let status: TierStatus;
    if (!t.passes) {
      status = 'ng';
    } else if (t.id === cheapestId) {
      status = 'best';
    } else if (isTight) {
      status = 'warn';
    } else {
      status = 'ok';
    }
    return {
      ...t,
      isTight,
      status,
    };
  });

  const cheapest = tiers.find((t) => t.id === cheapestId) ?? null;

  let autoFits3cm = false;
  if (!hasB5 && sb === 'stack' && totalCopies > 0) {
    const autoCols = resolveCols(allCopies, 'auto');
    const autoStacks = greedyStack(allCopies, autoCols);
    const autoTBooks = autoStacks.reduce((m, s) => Math.max(m, s.heightMm), 0);
    const autoTTotal = round1(autoTBooks + tGoods + tPkg);
    autoFits3cm = autoTTotal <= 30.0 && wTotal <= 4000;
  }

  const twoPackSplit =
    tTotal > 30.0 && totalCopies >= 2
      ? computeTwoPackSplit(allCopies, sb, tGoods, wGoods, tPkg, wPkg)
      : null;

  let verdict: VerdictKind;
  if (tTotal > 30.0 || wTotal > 4000) {
    verdict = 'no';
  } else if (wTotal > 2000) {
    verdict = 'warn_weight_light';
  } else if (isTightZone) {
    verdict = 'warn_tight';
  } else {
    verdict = 'ok';
  }

  let advice: AdviceKind = 'none';
  if (verdict === 'no') {
    const plusPasses = tiers.find((t) => t.id === 'yupacket_plus_booth')?.passes ?? false;
    if (wTotal > 4000) {
      advice = 'over_4kg';
    } else if (!hasB5 && sb === 'stack' && autoFits3cm) {
      advice = 'enable_side_by_side';
    } else if (plusPasses) {
      advice = 'use_yupacket_plus';
    } else if (twoPackSplit?.valid) {
      advice = 'use_two_pack';
    } else {
      advice = 'use_letterpack_plus';
    }
  }

  return {
    totalCopies,
    hasB5,
    allBunko,
    cols,
    colStacks,
    maxColIndex,
    tBooks,
    tBooksSingle,
    tGoods,
    wGoods,
    tPkg,
    wPkg,
    tTotal,
    tSingleTotal,
    wTotal,
    margin,
    bookDetails,
    tiers,
    cheapest,
    verdict,
    advice,
    autoFits3cm,
    twoPackSplit,
  };
}
