export type BindingMode = 'saddle' | 'multi';
export type ReadingDir = 'ltr' | 'rtl';
export type CoverMode = 'included' | 'separate';
export type SheetsPreset = '1' | '2' | '3' | '4' | '5' | '6' | 'custom';

export interface ImpositionInput {
  mode: BindingMode;
  pagesRaw: string;
  sheetsPreset: SheetsPreset;
  customSheetsRaw: string;
  dir: ReadingDir;
  cover: CoverMode;
}

export interface Slot {
  page: number;
  isBlank: boolean;
  isCoverFront: boolean;
  isCoverBack: boolean;
}

export interface SheetRow {
  sheetIndex: number;
  front: [Slot, Slot];
  back: [Slot, Slot];
  isEmptySheet: boolean;
}

export interface SignatureGroup {
  sigIndex: number;
  startPage: number;
  endPage: number;
  sheets: SheetRow[];
  printOrder: string;
  hasBlank: boolean;
}

export interface CoverSheet {
  front: [string, string];
  back: [string, string];
}

export interface OptimalSuggestion {
  sheetsPerSig: number;
  pagesPerSig: number;
  signatures: number;
  blankPages: number;
}

export interface ImpositionResult {
  mode: BindingMode;
  dir: ReadingDir;
  cover: CoverMode;
  contentPages: number;
  sheetsPerSig: number;
  pagesPerSig: number;
  signaturesCount: number;
  totalSheets: number;
  totalPages: number;
  blankPages: number;
  emptySheets: number;
  signatures: SignatureGroup[];
  coverSheet: CoverSheet | null;
  printOrder: string;
  suggestion: OptimalSuggestion | null;
}

export type ValidationErrorKey = 'pagesRange' | 'sheetsRange';

export type ValidationResult =
  | { status: 'empty' }
  | { status: 'invalid'; errors: { pages?: ValidationErrorKey; customSheets?: ValidationErrorKey } }
  | { status: 'valid'; result: ImpositionResult };

export const DEFAULT_INPUT: ImpositionInput = {
  mode: 'saddle',
  pagesRaw: '',
  sheetsPreset: '4',
  customSheetsRaw: '4',
  dir: 'ltr',
  cover: 'included',
};

export const EXAMPLE_INPUT: ImpositionInput = {
  mode: 'multi',
  pagesRaw: '36',
  sheetsPreset: '3',
  customSheetsRaw: '4',
  dir: 'ltr',
  cover: 'included',
};

export const PREVIEW_EXAMPLE_INPUT: ImpositionInput = {
  mode: 'saddle',
  pagesRaw: '16',
  sheetsPreset: '4',
  customSheetsRaw: '4',
  dir: 'ltr',
  cover: 'included',
};

const CANDIDATE_SHEETS = [2, 3, 4, 5, 6] as const;
const VALID_PRESETS = new Set<string>(['1', '2', '3', '4', '5', '6', 'custom']);

/** Normalize NFKC full-width characters and strip whitespace and commas. */
export function normalizeIntInput(raw: string): string {
  return raw.normalize('NFKC').replace(/[\s,]+/g, '');
}

/** Parse a normalized integer within [min, max], returning null on invalid input. */
export function parseIntInRange(raw: string, min: number, max: number): number | null {
  const s = normalizeIntInput(raw);
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isSafeInteger(n) || n < min || n > max) return null;
  return n;
}

/**
 * Suggest a better sheets-per-signature S' in [2..6] (S' !== S) when multi-signature blankPages >= 4.
 * Picks strictly minimum blank' < currentBlank; tie-breaks by smallest |S' - 4|, then smaller S'.
 */
export function findOptimalSheets(
  contentPages: number,
  currentSheets: number,
  currentBlank: number,
): OptimalSuggestion | null {
  let best: OptimalSuggestion | null = null;
  for (const s of CANDIDATE_SHEETS) {
    if (s === currentSheets) continue;
    const pSig = 4 * s;
    const k = Math.ceil(contentPages / pSig);
    const blank = k * pSig - contentPages;
    if (blank >= currentBlank) continue;
    if (
      best === null ||
      blank < best.blankPages ||
      (blank === best.blankPages &&
        (Math.abs(s - 4) < Math.abs(best.sheetsPerSig - 4) ||
          (Math.abs(s - 4) === Math.abs(best.sheetsPerSig - 4) && s < best.sheetsPerSig)))
    ) {
      best = {
        sheetsPerSig: s,
        pagesPerSig: pSig,
        signatures: k,
        blankPages: blank,
      };
    }
  }
  return best;
}

function makeSlot(page: number, contentPages: number, totalPages: number, cover: CoverMode): Slot {
  return {
    page,
    isBlank: page > contentPages,
    isCoverFront: cover === 'included' && page === 1,
    isCoverBack: cover === 'included' && page === totalPages,
  };
}

export function calculateImposition(input: ImpositionInput): ValidationResult {
  const pagesNormalized = normalizeIntInput(input.pagesRaw);
  const errors: { pages?: ValidationErrorKey; customSheets?: ValidationErrorKey } = {};

  let sheetsPerSig = 4;
  if (input.mode === 'multi') {
    if (input.sheetsPreset === 'custom') {
      const parsedCustom = parseIntInRange(input.customSheetsRaw, 1, 20);
      if (parsedCustom === null) {
        errors.customSheets = 'sheetsRange';
      } else {
        sheetsPerSig = parsedCustom;
      }
    } else {
      sheetsPerSig = Number(input.sheetsPreset);
    }
  }

  if (pagesNormalized === '') {
    if (errors.customSheets) return { status: 'invalid', errors };
    return { status: 'empty' };
  }

  const contentPages = parseIntInRange(pagesNormalized, 1, 1000);
  if (contentPages === null) {
    errors.pages = 'pagesRange';
  }

  if (errors.pages || errors.customSheets || contentPages === null) {
    return { status: 'invalid', errors };
  }

  const S = input.mode === 'saddle' ? Math.ceil(contentPages / 4) : sheetsPerSig;
  const K = input.mode === 'saddle' ? 1 : Math.ceil(contentPages / (4 * S));
  const P_sig = 4 * S;
  const N_total = K * P_sig;
  const N_blank = N_total - contentPages;
  const totalSheets = K * S;

  const signatures: SignatureGroup[] = [];
  const allOrderSlots: number[] = [];
  let emptySheets = 0;

  for (let k = 1; k <= K; k++) {
    const a = (k - 1) * P_sig + 1;
    const b = k * P_sig;
    const sheets: SheetRow[] = [];
    const sigOrderSlots: number[] = [];
    let hasBlank = false;

    for (let i = 1; i <= S; i++) {
      const pLowF = a + 2 * (i - 1);
      const pHighF = b - 2 * (i - 1);
      const pLowB = pLowF + 1;
      const pHighB = pHighF - 1;

      const frontNums: [number, number] = input.dir === 'ltr' ? [pHighF, pLowF] : [pLowF, pHighF];
      const backNums: [number, number] = input.dir === 'ltr' ? [pLowB, pHighB] : [pHighB, pLowB];

      const front: [Slot, Slot] = [
        makeSlot(frontNums[0], contentPages, N_total, input.cover),
        makeSlot(frontNums[1], contentPages, N_total, input.cover),
      ];
      const back: [Slot, Slot] = [
        makeSlot(backNums[0], contentPages, N_total, input.cover),
        makeSlot(backNums[1], contentPages, N_total, input.cover),
      ];

      const sheetBlankCount = [front[0], front[1], back[0], back[1]].filter((s) => s.isBlank).length;
      if (sheetBlankCount > 0) hasBlank = true;
      const isEmptySheet = sheetBlankCount === 4;
      if (isEmptySheet) emptySheets++;

      sheets.push({ sheetIndex: i, front, back, isEmptySheet });
      sigOrderSlots.push(frontNums[0], frontNums[1], backNums[0], backNums[1]);
      allOrderSlots.push(frontNums[0], frontNums[1], backNums[0], backNums[1]);
    }

    signatures.push({
      sigIndex: k,
      startPage: a,
      endPage: b,
      sheets,
      printOrder: sigOrderSlots.join(','),
      hasBlank,
    });
  }

  const coverSheet: CoverSheet | null =
    input.cover === 'separate'
      ? input.dir === 'ltr'
        ? { front: ['封底', '封面'], back: ['封裡', '封底裡'] }
        : { front: ['封面', '封底'], back: ['封底裡', '封裡'] }
      : null;

  const suggestion =
    input.mode === 'multi' && N_blank >= 4 ? findOptimalSheets(contentPages, S, N_blank) : null;

  return {
    status: 'valid',
    result: {
      mode: input.mode,
      dir: input.dir,
      cover: input.cover,
      contentPages,
      sheetsPerSig: S,
      pagesPerSig: P_sig,
      signaturesCount: K,
      totalSheets,
      totalPages: N_total,
      blankPages: N_blank,
      emptySheets,
      signatures,
      coverSheet,
      printOrder: allOrderSlots.join(','),
      suggestion,
    },
  };
}

/** Restore state from URL query params; invalid params fall back to defaults. */
export function parseUrlState(query: Record<string, string>): ImpositionInput {
  const mode: BindingMode = query.m === 'multi' ? 'multi' : 'saddle';
  const dir: ReadingDir = query.d === 'rtl' ? 'rtl' : 'ltr';
  const cover: CoverMode = query.c === 'separate' || query.c === 'sep' ? 'separate' : 'included';

  let pagesRaw = '';
  if (typeof query.n === 'string' && query.n !== '') {
    const parsedN = parseIntInRange(query.n, 1, 1000);
    if (parsedN !== null) pagesRaw = String(parsedN);
  }

  let sheetsPreset: SheetsPreset = '4';
  let customSheetsRaw = '4';
  if (mode === 'multi' && typeof query.s === 'string' && query.s !== '') {
    const parsedS = parseIntInRange(query.s, 1, 20);
    if (parsedS !== null) {
      if (parsedS <= 6 && VALID_PRESETS.has(String(parsedS))) {
        sheetsPreset = String(parsedS) as SheetsPreset;
      } else {
        sheetsPreset = 'custom';
        customSheetsRaw = String(parsedS);
      }
    }
  }

  return { mode, pagesRaw, sheetsPreset, customSheetsRaw, dir, cover };
}

/** Serialize non-empty state to URL query keys matching spec (`m`, `n`, `s`, `d`, `c`). */
export function toUrlState(input: ImpositionInput): Record<string, string> {
  const n = parseIntInRange(input.pagesRaw, 1, 1000);
  if (n === null) return {};
  const state: Record<string, string> = {
    m: input.mode,
    n: String(n),
    d: input.dir,
    c: input.cover,
  };
  if (input.mode === 'multi') {
    const s =
      input.sheetsPreset === 'custom'
        ? parseIntInRange(input.customSheetsRaw, 1, 20)
        : Number(input.sheetsPreset);
    if (s !== null) state.s = String(s);
  }
  return state;
}

export interface SvgLabels {
  titlePrefix: string;
  modeSaddle: string;
  modeMulti: string;
  dirLtr: string;
  dirRtl: string;
  examplePill: string;
  subtitle: string;
  subtitleCoverExtra: string;
  shortEdgeTag: string;
  sigChip: string;
  coverLabel: string;
  sheetLabelSaddle: string;
  sheetLabelMulti: string;
  frontLabel: string;
  backLabel: string;
  flipLabel: string;
  creaseLabel: string;
  truncateNote: string;
  blankShort: string;
  slotPrefix: string;
  coverFrontShort: string;
  coverBackShort: string;
}

function escXml(s: string): string {
  return s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);
}

function drawSlotCell(
  parts: string[],
  x: number,
  y: number,
  w: number,
  h: number,
  slot: Slot,
  labels: SvgLabels,
): void {
  const cx = x + w / 2;
  if (slot.isBlank) {
    parts.push(
      `<rect x="${x + 4}" y="${y + 4}" width="${w - 8}" height="${h - 8}" rx="3" fill="var(--paper)" stroke="var(--line-strong)" stroke-width="1" stroke-dasharray="3 2" />`,
      `<text x="${cx}" y="${y + 23}" font-size="11.5" font-weight="600" text-anchor="middle" fill="var(--muted)">${escXml(labels.blankShort)}</text>`,
      `<text x="${cx}" y="${y + 38}" font-size="10" text-anchor="middle" fill="var(--muted)">${escXml(`${labels.slotPrefix} ${slot.page}`)}</text>`,
    );
    return;
  }

  const badge = slot.isCoverFront ? labels.coverFrontShort : slot.isCoverBack ? labels.coverBackShort : '';
  if (badge) {
    parts.push(
      `<text x="${cx}" y="${y + 25}" font-size="16" font-weight="700" text-anchor="middle" fill="var(--ink)">${slot.page}</text>`,
      `<rect x="${cx - 16}" y="${y + 31}" width="32" height="15" rx="4" fill="var(--mark)" />`,
      `<text x="${cx}" y="${y + 42}" font-size="9.5" font-weight="700" text-anchor="middle" fill="var(--accent-strong)">${escXml(badge)}</text>`,
    );
  } else {
    parts.push(
      `<text x="${cx}" y="${y + 31}" font-size="17" font-weight="700" text-anchor="middle" fill="var(--ink)">${slot.page}</text>`,
    );
  }
}

function drawSpreadRow(
  parts: string[],
  y: number,
  rowLabel: string,
  frontLeft: { text?: string; slot?: Slot },
  frontRight: { text?: string; slot?: Slot },
  backLeft: { text?: string; slot?: Slot },
  backRight: { text?: string; slot?: Slot },
  labels: SvgLabels,
): void {
  const rectY = y + 20;
  const rectW = 216;
  const rectH = 50;
  const halfW = rectW / 2;
  const frontX = 18;
  const backX = 326;

  parts.push(
    `<text x="18" y="${y + 13}" font-size="11.5" font-weight="700" fill="var(--ink)">${escXml(rowLabel)}</text>`,
    `<text x="${frontX + halfW}" y="${y + 13}" font-size="10.5" font-weight="600" text-anchor="middle" fill="var(--muted)">${escXml(labels.frontLabel)}</text>`,
    `<text x="${backX + halfW}" y="${y + 13}" font-size="10.5" font-weight="600" text-anchor="middle" fill="var(--muted)">${escXml(labels.backLabel)}</text>`,
  );

  // Front rectangle
  parts.push(
    `<rect x="${frontX}" y="${rectY}" width="${rectW}" height="${rectH}" rx="4" fill="var(--surface)" stroke="var(--line-strong)" stroke-width="1.2" />`,
    `<line x1="${frontX + halfW}" y1="${rectY + 3}" x2="${frontX + halfW}" y2="${rectY + rectH - 3}" stroke="var(--line-strong)" stroke-width="1" stroke-dasharray="3 3" />`,
  );
  if (frontLeft.slot) drawSlotCell(parts, frontX, rectY, halfW, rectH, frontLeft.slot, labels);
  else if (frontLeft.text) {
    parts.push(
      `<text x="${frontX + halfW / 2}" y="${rectY + 30}" font-size="13" font-weight="700" text-anchor="middle" fill="var(--accent-strong)">${escXml(frontLeft.text)}</text>`,
    );
  }
  if (frontRight.slot) drawSlotCell(parts, frontX + halfW, rectY, halfW, rectH, frontRight.slot, labels);
  else if (frontRight.text) {
    parts.push(
      `<text x="${frontX + halfW * 1.5}" y="${rectY + 30}" font-size="13" font-weight="700" text-anchor="middle" fill="var(--accent-strong)">${escXml(frontRight.text)}</text>`,
    );
  }

  // Curved horizontal flip arrow between Front and Back
  const arrowY = rectY + 25;
  parts.push(
    `<path d="M 244 ${arrowY - 3} Q 280 ${arrowY - 14} 316 ${arrowY - 3}" fill="none" stroke="var(--accent)" stroke-width="1.5" />`,
    `<polygon points="318,${arrowY - 2} 311,${arrowY - 7} 312,${arrowY}" fill="var(--accent)" />`,
    `<polygon points="242,${arrowY - 2} 249,${arrowY - 7} 248,${arrowY}" fill="var(--accent)" />`,
    `<text x="280" y="${arrowY + 13}" font-size="10" font-weight="600" text-anchor="middle" fill="var(--accent-strong)">${escXml(labels.flipLabel)}</text>`,
    `<text x="${frontX + halfW}" y="${rectY + rectH + 11}" font-size="9" text-anchor="middle" fill="var(--muted)">${escXml(labels.creaseLabel)}</text>`,
    `<text x="${backX + halfW}" y="${rectY + rectH + 11}" font-size="9" text-anchor="middle" fill="var(--muted)">${escXml(labels.creaseLabel)}</text>`,
  );

  // Back rectangle
  parts.push(
    `<rect x="${backX}" y="${rectY}" width="${rectW}" height="${rectH}" rx="4" fill="var(--surface)" stroke="var(--line-strong)" stroke-width="1.2" />`,
    `<line x1="${backX + halfW}" y1="${rectY + 3}" x2="${backX + halfW}" y2="${rectY + rectH - 3}" stroke="var(--line-strong)" stroke-width="1" stroke-dasharray="3 3" />`,
  );
  if (backLeft.slot) drawSlotCell(parts, backX, rectY, halfW, rectH, backLeft.slot, labels);
  else if (backLeft.text) {
    parts.push(
      `<text x="${backX + halfW / 2}" y="${rectY + 30}" font-size="13" font-weight="700" text-anchor="middle" fill="var(--accent-strong)">${escXml(backLeft.text)}</text>`,
    );
  }
  if (backRight.slot) drawSlotCell(parts, backX + halfW, rectY, halfW, rectH, backRight.slot, labels);
  else if (backRight.text) {
    parts.push(
      `<text x="${backX + halfW * 1.5}" y="${rectY + 30}" font-size="13" font-weight="700" text-anchor="middle" fill="var(--accent-strong)">${escXml(backRight.text)}</text>`,
    );
  }
}

/** Build a standalone, dark-mode-ready inline SVG diagram matching spec section 8. */
export function buildImpositionSvg(res: ImpositionResult, labels: SvgLabels, isExample: boolean): string {
  const modeLabel = res.mode === 'saddle' ? labels.modeSaddle : labels.modeMulti;
  const dirLabel = res.dir === 'ltr' ? labels.dirLtr : labels.dirRtl;
  const titleText = `${labels.titlePrefix}${modeLabel}・${dirLabel}`;
  const subtitleBase = labels.subtitle
    .replace('{N}', String(res.contentPages))
    .replace('{N_blank}', String(res.blankPages))
    .replace('{K}', String(res.signaturesCount))
    .replace('{totalSheets}', String(res.totalSheets));
  const subtitleText = res.cover === 'separate' ? `${subtitleBase}${labels.subtitleCoverExtra}` : subtitleBase;

  const parts: string[] = [];
  let y = 76;

  // Signature strip when K > 1
  if (res.signaturesCount > 1) {
    const chips: { text: string; hasBlank: boolean; isEllipsis?: boolean }[] = [];
    if (res.signaturesCount <= 8) {
      for (const sig of res.signatures) {
        chips.push({
          text: labels.sigChip
            .replace('{k}', String(sig.sigIndex))
            .replace('{a}', String(sig.startPage))
            .replace('{b}', String(sig.endPage)),
          hasBlank: sig.hasBlank,
        });
      }
    } else {
      for (let idx = 0; idx < 4; idx++) {
        const sig = res.signatures[idx];
        chips.push({
          text: labels.sigChip
            .replace('{k}', String(sig.sigIndex))
            .replace('{a}', String(sig.startPage))
            .replace('{b}', String(sig.endPage)),
          hasBlank: sig.hasBlank,
        });
      }
      chips.push({ text: '…', hasBlank: false, isEllipsis: true });
      for (let idx = res.signaturesCount - 3; idx < res.signaturesCount; idx++) {
        const sig = res.signatures[idx];
        chips.push({
          text: labels.sigChip
            .replace('{k}', String(sig.sigIndex))
            .replace('{a}', String(sig.startPage))
            .replace('{b}', String(sig.endPage)),
          hasBlank: sig.hasBlank,
        });
      }
    }

    const cols = 4;
    const chipW = 125;
    const chipH = 22;
    const gapX = 8;
    const gapY = 6;
    chips.forEach((chip, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const cx = 18 + col * (chipW + gapX);
      const cy = y + row * (chipH + gapY);
      const fill = chip.hasBlank ? 'var(--warn-bg)' : 'var(--paper)';
      const stroke = chip.hasBlank ? 'var(--warn)' : 'var(--line)';
      const textFill = chip.hasBlank ? 'var(--warn)' : 'var(--ink)';
      parts.push(
        `<rect x="${cx}" y="${cy}" width="${chipW}" height="${chipH}" rx="5" fill="${fill}" stroke="${stroke}" stroke-width="1" />`,
        `<text x="${cx + chipW / 2}" y="${cy + 15}" font-size="10.5" font-weight="600" text-anchor="middle" fill="${textFill}">${escXml(chip.text)}</text>`,
      );
    });
    const chipRows = Math.ceil(chips.length / cols);
    y += chipRows * (chipH + gapY) + 6;
  }

  // Cover sheet row if separate
  if (res.coverSheet) {
    drawSpreadRow(
      parts,
      y,
      labels.coverLabel,
      { text: res.coverSheet.front[0] },
      { text: res.coverSheet.front[1] },
      { text: res.coverSheet.back[0] },
      { text: res.coverSheet.back[1] },
      labels,
    );
    y += 88;
  }

  // Sheet spread pairs
  let truncated = false;
  const rowsToDraw: { label: string; sheet: SheetRow }[] = [];

  if (res.totalSheets <= 6) {
    for (const sig of res.signatures) {
      for (const sh of sig.sheets) {
        const label =
          res.signaturesCount === 1
            ? labels.sheetLabelSaddle.replace('{i}', String(sh.sheetIndex))
            : labels.sheetLabelMulti.replace('{k}', String(sig.sigIndex)).replace('{i}', String(sh.sheetIndex));
        rowsToDraw.push({ label, sheet: sh });
      }
    }
  } else if (res.signaturesCount > 1) {
    truncated = true;
    const selectedSigs = [res.signatures[0], res.signatures[res.signaturesCount - 1]];
    for (const sig of selectedSigs) {
      const sheets =
        sig.sheets.length <= 4 ? sig.sheets : [sig.sheets[0], sig.sheets[1], sig.sheets[sig.sheets.length - 1]];
      for (const sh of sheets) {
        const label = labels.sheetLabelMulti
          .replace('{k}', String(sig.sigIndex))
          .replace('{i}', String(sh.sheetIndex));
        rowsToDraw.push({ label, sheet: sh });
      }
    }
  } else {
    truncated = true;
    const sheets = res.signatures[0].sheets;
    const picked = [sheets[0], sheets[1], sheets[2], sheets[sheets.length - 2], sheets[sheets.length - 1]];
    for (const sh of picked) {
      const label = labels.sheetLabelSaddle.replace('{i}', String(sh.sheetIndex));
      rowsToDraw.push({ label, sheet: sh });
    }
  }

  for (const row of rowsToDraw) {
    drawSpreadRow(
      parts,
      y,
      row.label,
      { slot: row.sheet.front[0] },
      { slot: row.sheet.front[1] },
      { slot: row.sheet.back[0] },
      { slot: row.sheet.back[1] },
      labels,
    );
    y += 88;
  }

  if (truncated) {
    const note = labels.truncateNote.replace('{totalSheets}', String(res.totalSheets));
    parts.push(
      `<rect x="18" y="${y}" width="524" height="24" rx="5" fill="var(--paper)" stroke="var(--line)" stroke-width="1" />`,
      `<text x="280" y="${y + 16}" font-size="11" font-weight="600" text-anchor="middle" fill="var(--muted)">${escXml(note)}</text>`,
    );
    y += 34;
  }

  const totalH = y + 8;
  const header: string[] = [
    `<title>${escXml(`${titleText}：${subtitleText}`)}</title>`,
    `<rect x="0.5" y="0.5" width="559" height="${totalH - 1}" rx="10" fill="var(--surface)" stroke="var(--line)" stroke-width="1" />`,
    `<text x="18" y="28" font-size="15.5" font-weight="700" fill="var(--ink)">${escXml(titleText)}</text>`,
  ];

  if (isExample) {
    header.push(
      `<rect x="466" y="12" width="76" height="21" rx="999" fill="var(--warn-bg)" stroke="var(--warn)" stroke-width="1" />`,
      `<text x="504" y="26.5" font-size="11" font-weight="700" text-anchor="middle" fill="var(--warn)">${escXml(labels.examplePill)}</text>`,
    );
  }

  header.push(
    `<text x="18" y="51" font-size="11.5" fill="var(--muted)">${escXml(subtitleText)}</text>`,
    `<rect x="396" y="37" width="146" height="20" rx="999" fill="var(--mark)" />`,
    `<text x="469" y="50.5" font-size="10.5" font-weight="700" text-anchor="middle" fill="var(--accent-strong)">${escXml(labels.shortEdgeTag)}</text>`,
    `<line x1="18" y1="65" x2="542" y2="65" stroke="var(--line)" stroke-width="1" />`,
  );

  return `<svg viewBox="0 0 560 ${totalH}" width="100%" role="img" aria-label="${escXml(`${titleText}：${subtitleText}`)}" class="imposition-svg">${header.join('')}${parts.join('')}</svg>`;
}

