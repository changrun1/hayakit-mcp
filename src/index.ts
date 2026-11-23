import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import {
  ageOn,
  erasFor,
  eto,
  parseText,
  rocYear,
  shengxiao,
} from './calculators/era.js';
import {
  calculateRosette,
  DEFAULT_INPUT as ROSETTE_DEFAULT,
  type BadgePreset,
  type FoldMode,
  type TierCount,
} from './calculators/rosette.js';
import {
  calculateParacord,
  DEFAULT_INPUT as PARACORD_DEFAULT,
  type BucklePreset,
  type ColorMode,
  type FitEase,
  type MarginPct,
  type Mode as ParacordMode,
  type Unit as ParacordUnit,
  type WeaveKey,
} from './calculators/paracord.js';
import {
  calculateTarp,
  DEFAULT_INPUT as TARP_DEFAULT,
  type GuyAngle,
  type PoleTie,
  type SitePreset,
  type TarpType,
} from './calculators/tarp.js';
import {
  calculateImposition,
  DEFAULT_INPUT as BOOKLET_DEFAULT,
  type BindingMode,
  type CoverMode,
  type ReadingDir,
  type SheetsPreset,
} from './calculators/booklet.js';
import {
  calculate as calculateDoujinShipping,
  type BookFormat,
  type PackagingType,
  type PaperType,
  type SideBySideMode,
} from './calculators/doujin-shipping.js';
import {
  calculateLeatherThread,
  DEFAULT_INPUT as LEATHER_DEFAULT,
} from './calculators/leather-thread.js';
import {
  calculatePlan as calculateCassettePlan,
  DEFAULT_FORMAT as CASSETTE_DEFAULT_FORMAT,
  DEFAULT_GAP as CASSETTE_DEFAULT_GAP,
  DEFAULT_MODE as CASSETTE_DEFAULT_MODE,
  DEFAULT_RESERVE as CASSETTE_DEFAULT_RESERVE,
  parseTrackLines,
  type CassetteFormat,
  type SplitMode,
} from './calculators/cassette.js';

const server = new McpServer({
  name: 'hayakit-calculators',
  version: '1.0.0',
});

function jsonResult(data: unknown, webUrl: string) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({ ...((typeof data === 'object' && data !== null) ? data : { result: data }), webCalculatorUrl: webUrl }, null, 2),
      },
    ],
  };
}

// 1. Japanese Era / Taiwan ROC / Western Year Converter
server.tool(
  'convert_era',
  'Convert between Western years (AD), Japanese eras (Reiwa/Heisei/Showa/Taisho/Meiji including transition dates), Taiwan ROC years (民國), zodiac (干支/生肖), and age.',
  {
    query: z
      .string()
      .describe('Free-text date or year expression, e.g. "令和8年", "平成3年5月1日", "S60", "民國87年", "1989", "1998/05/01"'),
    referenceDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe('Optional reference date (YYYY-MM-DD) for age calculation; defaults to today.'),
  },
  async ({ query, referenceDate }) => {
    const parsed = parseText(query);
    const ref = referenceDate
      ? (referenceDate.split('-').map(Number) as [number, number, number])
      : (() => {
          const now = new Date();
          return [now.getFullYear(), now.getMonth() + 1, now.getDate()] as [number, number, number];
        })();

    const items = parsed.map((p) => {
      const eras = erasFor(p.y, p.m, p.d).map((e) => ({
        key: e.era.key,
        name: e.era.name,
        abbr: e.era.abbr,
        year: e.n,
        label: `${e.era.name}${e.n === 1 ? '元' : e.n}年`,
      }));
      const roc = rocYear(p.y);
      const age = ageOn({ y: p.y, m: p.m, d: p.d }, ref);
      return {
        raw: p.raw,
        westernYear: p.y,
        month: p.m ?? null,
        day: p.d ?? null,
        japaneseEras: eras,
        taiwanRocYear: roc,
        taiwanRocLabel: roc >= 1 ? `民國${roc}年` : `民前${1 - roc}年`,
        japaneseZodiac: eto(p.y),
        chineseZodiac: shengxiao(p.y),
        age,
        eraOverflowWarning: Boolean(p.overflow),
      };
    });

    return jsonResult(
      {
        query,
        referenceDate: `${ref[0]}-${String(ref[1]).padStart(2, '0')}-${String(ref[2]).padStart(2, '0')}`,
        matches: items,
      },
      'https://hayakit.com/ja/wareki/',
    );
  },
);

// 2. Can-Badge Rosette Ribbon Calculator
server.tool(
  'calculate_rosette_ribbon',
  'Calculate exact ribbon cutting lengths, pleat counts, finished outer diameter, and purchase yardage for 1/2/3-tier can-badge rosettes.',
  {
    badgeDiameterMm: z.number().min(20).max(150).default(57).describe('Can-badge diameter in mm (common: 44, 57, 75).'),
    tiers: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(2).describe('Number of ribbon tiers (1, 2, or 3).'),
    ribbonWidthsMm: z
      .array(z.number().min(6).max(60))
      .min(1)
      .max(3)
      .default([36, 24, 15])
      .describe('Ribbon width in mm for each tier (outer to inner).'),
    foldMode: z
      .enum(['h', 't', 'p'])
      .default('h')
      .describe('Fold method: "h" (hand-pleated standard), "t" (tailored/measured test fold), "p" (pre-pleated).'),
    pleatPitchMm: z.number().min(3).max(40).default(10).describe('Pleat spacing/pitch in mm.'),
    pleatDepthMm: z.number().min(3).max(50).default(15).describe('Pleat fold depth in mm.'),
    tailCount: z.number().int().min(0).max(6).default(2).describe('Number of hanging tail ribbons.'),
    tailLengthCm: z.number().min(0).max(60).default(15).describe('Length of each tail ribbon in cm.'),
  },
  async ({ badgeDiameterMm, tiers, ribbonWidthsMm, foldMode, pleatPitchMm, pleatDepthMm, tailCount, tailLengthCm }) => {
    const presetMap: Record<number, BadgePreset> = { 44: '44', 57: '57', 75: '75' };
    const bPreset: BadgePreset = presetMap[badgeDiameterMm] ?? 'other';
    const w: [number | null, number | null, number | null] = [
      ribbonWidthsMm[0] ?? 36,
      ribbonWidthsMm[1] ?? 24,
      ribbonWidthsMm[2] ?? 15,
    ];
    const res = calculateRosette({
      ...ROSETTE_DEFAULT,
      bPreset,
      bCustom: bPreset === 'other' ? badgeDiameterMm : null,
      n: tiers as TierCount,
      w,
      f: foldMode as FoldMode,
      s: pleatPitchMm,
      d: pleatDepthMm,
      tc: tailCount,
      tl: tailLengthCm,
    });
    return jsonResult(res, 'https://hayakit.com/ja/rosette-ribbon/');
  },
);

// 3. Paracord Bracelet / Strap Length Calculator
server.tool(
  'calculate_paracord_length',
  'Calculate exact paracord cutting length for Cobra, King Cobra, Fishtail, Snake, or custom weaves (1 or 2 colors, cm or inches, buckle deduction).',
  {
    wristOrTargetLength: z.number().positive().describe('Wrist circumference (mode="round") or straight finished length (mode="straight").'),
    unit: z.enum(['cm', 'in']).default('cm').describe('Measurement unit: "cm" or "in".'),
    mode: z.enum(['round', 'straight']).default('round').describe('"round" for wrist/collar loop, "straight" for flat strap.'),
    weave: z.enum(['cobra', 'kingCobra', 'fishtail', 'snake']).default('cobra').describe('Paracord weave pattern.'),
    colors: z.enum(['1', '2']).default('1').describe('Number of cord colors ("1" or "2").'),
    fitEaseCm: z.enum(['0', '0.5', '1.0']).default('0.5').describe('Comfort ease in cm ("0", "0.5", "1.0").'),
    buckleLengthCm: z.number().min(0).max(15).default(3.5).describe('Buckle length in cm (0 for loop/no buckle).'),
    marginPercent: z.enum(['0', '10', '20']).default('10').describe('Safety margin percentage ("0", "10", "20").'),
  },
  async ({ wristOrTargetLength, unit, mode, weave, colors, fitEaseCm, buckleLengthCm, marginPercent }) => {
    const bpMap: Record<number, BucklePreset> = { 0: '0', 2.7: '2.7', 3.5: '3.5', 4.5: '4.5' };
    const bp: BucklePreset = bpMap[buckleLengthCm] ?? 'custom';
    const res = calculateParacord({
      ...PARACORD_DEFAULT,
      m: mode as ParacordMode,
      u: unit as ParacordUnit,
      w: String(wristOrTargetLength),
      f: fitEaseCm as FitEase,
      k: weave as WeaveKey,
      c: colors as ColorMode,
      bp,
      b: bp === 'custom' ? String(buckleLengthCm) : '',
      mg: marginPercent as MarginPct,
    });
    return jsonResult(res, 'https://hayakit.com/zh-tw/paracord-bracelet/');
  },
);

// 4. Camping Tarp Guyline & Footprint Calculator
server.tool(
  'calculate_tarp_guyline',
  'Calculate camping tarp guyline cutting lengths, total cordage needed, hardware counts, peg distances, and campsite fit check.',
  {
    tarpType: z.enum(['rect', 'hex', 'custom']).default('rect').describe('Tarp shape: "rect", "hex", or "custom".'),
    tarpLengthCm: z.number().positive().default(500).describe('Tarp ridge length in cm.'),
    tarpWidthCm: z.number().positive().default(400).describe('Tarp width in cm.'),
    mainPoleCount: z.number().int().min(0).max(6).default(2).describe('Number of main poles.'),
    mainPoleHeightCm: z.number().positive().default(280).describe('Main pole height in cm.'),
    mainPoleTie: z.enum(['double', 'single']).default('double').describe('Main pole guyline style: "double" (Y-split) or "single".'),
    sidePoleCount: z.number().int().min(0).max(8).default(4).describe('Number of side poles.'),
    sidePoleHeightCm: z.number().min(0).default(180).describe('Side pole height in cm (0 if none).'),
    guyAngleDeg: z.union([z.literal(35), z.literal(45), z.literal(55)]).default(45).describe('Guyline angle from ground in degrees (35, 45, or 55).'),
    sitePreset: z.enum(['600x480', '400x600', '800x500', 'none']).default('600x480').describe('Campsite dimensions preset in cm, or "none".'),
  },
  async ({
    tarpType,
    tarpLengthCm,
    tarpWidthCm,
    mainPoleCount,
    mainPoleHeightCm,
    mainPoleTie,
    sidePoleCount,
    sidePoleHeightCm,
    guyAngleDeg,
    sitePreset,
  }) => {
    const res = calculateTarp({
      ...TARP_DEFAULT,
      t: tarpType as TarpType,
      tw: String(tarpLengthCm),
      tb: String(tarpWidthCm),
      mc: String(mainPoleCount),
      mh: String(mainPoleHeightCm),
      mt: mainPoleTie as PoleTie,
      sc: String(sidePoleCount),
      sh: sidePoleCount > 0 ? String(sidePoleHeightCm) : '',
      ang: guyAngleDeg as GuyAngle,
      site: sitePreset as SitePreset,
    });
    return jsonResult(res, 'https://hayakit.com/zh-tw/tarp-guyline/');
  },
);

// 5. Booklet / Zine Saddle-Stitch & Multi-Signature Imposition Calculator
server.tool(
  'calculate_booklet_imposition',
  'Calculate exact sheet imposition page order, blank page padding, and printer duplex page sequence for saddle-stitch or multi-signature booklets.',
  {
    pages: z.number().int().min(4).max(1000).describe('Total content page count.'),
    mode: z.enum(['saddle', 'multi']).default('saddle').describe('"saddle" (single booklet) or "multi" (multi-signature bookbinding).'),
    sheetsPerSignature: z.number().int().min(1).max(20).default(4).describe('Sheets per signature (only used when mode="multi").'),
    readingDirection: z.enum(['ltr', 'rtl']).default('ltr').describe('Reading direction: "ltr" (left-to-right) or "rtl" (right-to-left / Japanese manga/vertical).'),
    coverMode: z.enum(['included', 'separate']).default('included').describe('Whether cover pages are included in page count or printed separately.'),
  },
  async ({ pages, mode, sheetsPerSignature, readingDirection, coverMode }) => {
    const presetStr = String(sheetsPerSignature);
    const validPresets = new Set(['1', '2', '3', '4', '5', '6']);
    const sheetsPreset: SheetsPreset = validPresets.has(presetStr) ? (presetStr as SheetsPreset) : 'custom';
    const res = calculateImposition({
      ...BOOKLET_DEFAULT,
      mode: mode as BindingMode,
      pagesRaw: String(pages),
      sheetsPreset,
      customSheetsRaw: String(sheetsPerSignature),
      dir: readingDirection as ReadingDir,
      cover: coverMode as CoverMode,
    });
    return jsonResult(res, 'https://hayakit.com/zh-tw/booklet-imposition/');
  },
);

// 6. Doujinshi / Book Shipping Thickness & Weight Calculator (Japan Mail)
server.tool(
  'calculate_doujin_shipping_thickness',
  'Calculate total book stack thickness (mm), weight (g), and Japanese mail shipping eligibility (Click Post, Yu-Packet, Nekopos, Letter Pack).',
  {
    books: z
      .array(
        z.object({
          format: z.enum(['b5', 'a5', 'bunko']).describe('Book trim size: "b5", "a5", or "bunko".'),
          pages: z.number().int().min(4).max(1000).describe('Total pages including cover.'),
          paper: z
            .enum(['joshitsu70', 'joshitsu90', 'comic', 'shoseki62', 'shoseki90', 'matte90'])
            .default('joshitsu90')
            .describe('Interior paper stock.'),
          qty: z.number().int().min(1).max(100).default(1).describe('Number of copies.'),
        }),
      )
      .min(1)
      .describe('List of books in the parcel.'),
    packaging: z
      .enum(['card2', 'card1', 'opp', 'cushion', 'box'])
      .default('card2')
      .describe('Packaging type: "card2" (double cardboard), "card1" (single board), "opp", "cushion" (bubble mailer), "box".'),
    sideBySide: z.enum(['auto', 'stack']).default('auto').describe('Allow side-by-side placement for A5/Bunko books ("auto") or force stacking ("stack").'),
    goodsThicknessMm: z.number().min(0).max(100).default(0).describe('Additional flat goods thickness in mm.'),
    goodsWeightG: z.number().min(0).max(5000).default(0).describe('Additional goods weight in grams.'),
  },
  async ({ books, packaging, sideBySide, goodsThicknessMm, goodsWeightG }) => {
    const res = calculateDoujinShipping({
      books: books.map((b) => ({
        format: b.format as BookFormat,
        pages: b.pages,
        paper: b.paper as PaperType,
        qty: b.qty,
      })),
      packaging: packaging as PackagingType,
      sideBySide: sideBySide as SideBySideMode,
      goodsThickness: goodsThicknessMm,
      goodsWeight: goodsWeightG,
    });
    return jsonResult(res, 'https://hayakit.com/ja/doujin-tsuhan-atsumi/');
  },
);

// 7. Leathercraft Saddle-Stitch Thread Length Calculator
server.tool(
  'calculate_leather_thread',
  'Calculate waxed thread cutting length for leathercraft saddle-stitching from seam length or hole count, leather thickness, and pricking iron pitch.',
  {
    pitchMm: z.number().min(1.5).max(10).default(3.38).describe('Stitch spacing / pricking iron pitch in mm (e.g. 2.7, 3.0, 3.38, 3.85, 4.0, 5.0).'),
    seams: z
      .array(
        z.object({
          name: z.string().default('Seam').describe('Label for this seam.'),
          mode: z.enum(['len', 'holes']).default('len').describe('"len" (seam length in cm) or "holes" (number of holes).'),
          value: z.number().positive().describe('Seam length in cm (mode="len") or hole count (mode="holes").'),
          leatherThicknessMm: z.number().positive().default(3.0).describe('Total stacked leather thickness in mm.'),
          qty: z.number().int().min(1).max(50).default(1).describe('Number of identical seams.'),
        }),
      )
      .min(1)
      .describe('List of seams to stitch.'),
    backstitchStart: z.number().int().min(0).max(5).default(2).describe('Backstitch count at seam start.'),
    backstitchEnd: z.number().int().min(0).max(5).default(2).describe('Backstitch count at seam end.'),
    tailAllowanceCm: z.number().min(5).max(40).default(15).describe('Needle & knotting tail allowance per end in cm.'),
  },
  async ({ pitchMm, seams, backstitchStart, backstitchEnd, tailAllowanceCm }) => {
    const res = calculateLeatherThread({
      ...LEATHER_DEFAULT,
      p: String(pitchMm),
      bs: String(backstitchStart),
      be: String(backstitchEnd),
      tail: String(tailAllowanceCm),
      rows: seams.map((s) => ({
        name: s.name,
        mode: s.mode,
        val: String(s.value),
        t: String(s.leatherThicknessMm),
        qty: String(s.qty),
      })),
    });
    return jsonResult(res, 'https://hayakit.com/zh-tw/leather-thread-calc/');
  },
);

// 8. Audio Cassette Side A / Side B Track Split Calculator
server.tool(
  'calculate_cassette_split',
  'Plan Side A and Side B track splits, remaining tape time, and minimum cassette length (C10-C120) from a tracklist.',
  {
    tracklist: z
      .string()
      .describe('Newline-separated tracks with durations, e.g. "Track 1 3:45\\nTrack 2 4:12\\nTrack 3 5:01".'),
    format: z
      .enum(['C10', 'C20', 'C30', 'C45', 'C46', 'C54', 'C60', 'C90', 'C120', 'custom'])
      .default(CASSETTE_DEFAULT_FORMAT as 'C60')
      .describe('Cassette tape length tier (C10 to C120) or "custom".'),
    customSideSeconds: z.number().int().min(60).max(7200).optional().describe('Per-side capacity in seconds when format="custom".'),
    mode: z
      .enum(['seq', 'opt'])
      .default(CASSETTE_DEFAULT_MODE as 'seq')
      .describe('"seq" (keep track order) or "opt" (reorder tracks to balance Side A/B).'),
    gapSeconds: z.number().int().min(0).max(30).default(CASSETTE_DEFAULT_GAP).describe('Silence gap between tracks in seconds.'),
    reserveSeconds: z.number().int().min(0).max(120).default(CASSETTE_DEFAULT_RESERVE).describe('Leader/safety reserve seconds per side.'),
  },
  async ({ tracklist, format, customSideSeconds, mode, gapSeconds, reserveSeconds }) => {
    const parsed = parseTrackLines(tracklist);
    if (parsed.tracks.length === 0) {
      return jsonResult(
        { status: 'error', message: 'No valid tracks parsed.', lineErrors: parsed.errors },
        'https://hayakit.com/ja/cassette-jikan/',
      );
    }
    const plan = calculateCassettePlan({
      tracks: parsed.tracks,
      format: format as CassetteFormat,
      customCapSec: customSideSeconds,
      mode: mode as SplitMode,
      gap: gapSeconds,
      reserve: reserveSeconds,
    });
    return jsonResult({ ...plan, parseErrors: parsed.errors }, 'https://hayakit.com/ja/cassette-jikan/');
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('hayakit-mcp fatal error:', err);
  process.exit(1);
});
