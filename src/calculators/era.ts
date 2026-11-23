export type EraKey = 'reiwa' | 'heisei' | 'showa' | 'taisho' | 'meiji';
type YMD = [number, number, number];

export interface Era {
  key: EraKey;
  name: string;
  abbr: string;
  start: YMD;
}

/** Newest first. */
export const ERAS: Era[] = [
  { key: 'reiwa', name: '令和', abbr: 'R', start: [2019, 5, 1] },
  { key: 'heisei', name: '平成', abbr: 'H', start: [1989, 1, 8] },
  { key: 'showa', name: '昭和', abbr: 'S', start: [1926, 12, 25] },
  { key: 'taisho', name: '大正', abbr: 'T', start: [1912, 7, 30] },
  { key: 'meiji', name: '明治', abbr: 'M', start: [1868, 1, 25] },
];

const cmp = (a: YMD, b: YMD) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

export interface EraYear {
  era: Era;
  n: number;
}

/**
 * Eras that overlap the given year, month or day, oldest first.
 * A year-only query for 1989 returns both 昭和64 and 平成1.
 */
export function erasFor(y: number, m?: number, d?: number): EraYear[] {
  const from: YMD = [y, m ?? 1, d ?? 1];
  const to: YMD = [y, m ?? 12, d ?? 31];
  const out: EraYear[] = [];
  for (let i = ERAS.length - 1; i >= 0; i--) {
    const era = ERAS[i];
    const next = ERAS[i - 1];
    if (cmp(era.start, to) <= 0 && (!next || cmp(next.start, from) > 0)) {
      out.push({ era, n: y - era.start[0] + 1 });
    }
  }
  return out;
}

/** Republic of China year. 1912 = 1. Zero or negative means before the Republic (民前 = 1 - value). */
export const rocYear = (y: number) => y - 1911;

const ETO = '申酉戌亥子丑寅卯辰巳午未';
const SHENGXIAO = '猴雞狗豬鼠牛虎兔龍蛇馬羊';
export const eto = (y: number) => ETO[((y % 12) + 12) % 12];
export const shengxiao = (y: number) => SHENGXIAO[((y % 12) + 12) % 12];

export interface Age {
  min: number;
  max: number;
}

/** Age on `today`. Without a full birth date the birthday may or may not have passed, so a range is returned. */
export function ageOn(birth: { y: number; m?: number; d?: number }, today: YMD): Age | null {
  const [ty, tm, td] = today;
  const diff = ty - birth.y;
  let min = diff - 1;
  let max = diff;
  if (birth.m && birth.d) {
    min = max = cmp([0, tm, td], [0, birth.m, birth.d]) >= 0 ? diff : diff - 1;
  } else if (birth.m) {
    if (tm > birth.m) min = diff;
    else if (tm < birth.m) max = diff - 1;
  }
  if (max < 0) return null;
  return { min: Math.max(min, 0), max };
}

const KANJI_DIGITS = '〇一二三四五六七八九';

/** "元" → 1, "六十三" → 63, "一九九八" → 1998, "12" → 12. */
export function toInt(s: string): number {
  if (s === '元') return 1;
  if (/^\d+$/.test(s)) return Number(s);
  if (!/[十百]/.test(s)) return Number([...s].map((ch) => KANJI_DIGITS.indexOf(ch)).join(''));
  let total = 0;
  let cur = 0;
  for (const ch of s) {
    if (ch === '百') {
      total += (cur || 1) * 100;
      cur = 0;
    } else if (ch === '十') {
      total += (cur || 1) * 10;
      cur = 0;
    } else {
      cur = KANJI_DIGITS.indexOf(ch);
    }
  }
  return total + cur;
}

export interface Parsed {
  /** The matched text as written. */
  raw: string;
  y: number;
  m?: number;
  d?: number;
  source: 'era' | 'roc' | 'ad';
  /** Set when the input was a Japanese era. */
  era?: Era;
  eraYear?: number;
  /** The written era year runs past the end of that era (e.g. 平成35年 on an old licence). */
  overflow?: boolean;
}

const NUM = '元|\\d{1,4}|[〇一二三四五六七八九十百]{1,7}';
const HEAD = new RegExp(
  '(令和|平成|昭和|大正|明治|中華民國|民國|民国|民(?=\\s*\\d)|西元|西暦|西曆|公元|(?<![A-Za-z])[RHSTM](?=\\.?\\s*\\d))?' +
    `\\.?\\s*(?<!\\d)(${NUM})(?!\\d)\\s*(年次|年度|年)?`,
  'giu',
);
const TAIL_KANJI = new RegExp(`\\s*(${NUM})\\s*月(?:\\s*(${NUM})\\s*日)?`, 'yu');
const TAIL_SEP = /\s*[./\-]\s*(\d{1,2})(?!\d)(?:\s*[./\-]\s*(\d{1,2})(?!\d))?/y;
const COMPACT = /(?<!\d)(\d{4})(\d{2})(\d{2})(?!\d)/g;

const validMonth = (m?: number) => m !== undefined && m >= 1 && m <= 12;
const validDay = (d?: number) => d !== undefined && d >= 1 && d <= 31;

/** Find every date-like expression in free text: 平成3年, S60.5.1, 民國87年5月, 87年次, 1998/5/1, 19980501 … */
export function parseText(input: string): Parsed[] {
  const text = input.normalize('NFKC').replace(COMPACT, '$1/$2/$3');
  const out: Parsed[] = [];
  HEAD.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = HEAD.exec(text))) {
    const [whole, prefixRaw, numRaw, suffix] = match;
    const prefix = prefixRaw?.toUpperCase();
    const n = toInt(numRaw);
    let item: Omit<Parsed, 'raw'> | null = null;

    const era = prefix && ERAS.find((e) => e.name === prefix || e.abbr === prefix);
    if (era) {
      if (n >= 1 && n <= 99) item = { y: era.start[0] + n - 1, source: 'era', era, eraYear: n };
    } else if (prefix && (prefix.startsWith('民') || prefix === '中華民國')) {
      if (n >= 1 && n <= 300) item = { y: n + 1911, source: 'roc' };
    } else if (!prefix && suffix === '年次') {
      if (n >= 1 && n <= 300) item = { y: n + 1911, source: 'roc' };
    } else if (n >= 1868 && n <= 2200 && String(n).length === 4) {
      item = { y: n, source: 'ad' };
    }

    if (!item) {
      // Not a date head: step past the prefix only, so the number can be re-read on its own.
      if (prefixRaw) HEAD.lastIndex = match.index + prefixRaw.length;
      continue;
    }

    let end = HEAD.lastIndex;
    const tail = suffix === '年' ? TAIL_KANJI : suffix ? null : TAIL_SEP;
    if (tail) {
      tail.lastIndex = end;
      const t = tail.exec(text);
      if (t) {
        const m = toInt(t[1]);
        const d = t[2] ? toInt(t[2]) : undefined;
        if (validMonth(m)) {
          item.m = m;
          end = tail.lastIndex;
          if (validDay(d)) item.d = d;
        }
      }
    }
    HEAD.lastIndex = end;

    if (item.era) {
      const actual = erasFor(item.y, item.m, item.d);
      item.overflow = !actual.some((a) => a.era.key === item!.era!.key);
    }
    out.push({ raw: text.slice(match.index, end).replace(/^[.\s]+/, '').trim() || whole.trim(), ...item });
  }
  return out;
}
