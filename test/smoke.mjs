import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const entry = path.resolve(process.cwd(), 'dist', 'index.js');

async function withClient(fn) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [entry],
  });
  const client = new Client({ name: 'hayakit-mcp-smoke', version: '1.0.0' });
  await client.connect(transport);
  try {
    await fn(client);
  } finally {
    await client.close();
  }
}

function parseJsonText(res) {
  assert.ok(Array.isArray(res.content) && res.content.length > 0, 'Expected non-empty content');
  return JSON.parse(res.content[0].text);
}

test('lists and executes all 8 deterministic calculator tools over stdio', async () => {
  await withClient(async (client) => {
    const listed = await client.listTools();
    assert.equal(listed.tools.length, 8);

    // 1. convert_era
    const era = parseJsonText(
      await client.callTool({ name: 'convert_era', arguments: { query: '1989', referenceDate: '2026-11-23' } }),
    );
    assert.equal(era.matches[0].westernYear, 1989);
    assert.equal(era.matches[0].japaneseEras.length, 2);
    assert.equal(era.matches[0].taiwanRocYear, 78);
    assert.equal(era.webCalculatorUrl, 'https://hayakit.com/ja/wareki/');

    // 2. calculate_rosette_ribbon
    const rosette = parseJsonText(
      await client.callTool({ name: 'calculate_rosette_ribbon', arguments: { badgeDiameterMm: 57, tiers: 2 } }),
    );
    assert.equal(rosette.status, 'ok');
    assert.ok(rosette.totalCm > 0);

    // 3. calculate_paracord_length
    const paracord = parseJsonText(
      await client.callTool({
        name: 'calculate_paracord_length',
        arguments: { wristOrTargetLength: 17.5, unit: 'cm', weave: 'cobra' },
      }),
    );
    assert.equal(paracord.status, 'ok');
    assert.ok(paracord.cutACm > 100);

    // 4. calculate_tarp_guyline
    const tarp = parseJsonText(
      await client.callTool({
        name: 'calculate_tarp_guyline',
        arguments: { tarpType: 'rect', tarpLengthCm: 500, tarpWidthCm: 400, mainPoleHeightCm: 280 },
      }),
    );
    assert.equal(tarp.status, 'ok');
    assert.ok(tarp.totalCm > 1000);

    // 5. calculate_booklet_imposition
    const booklet = parseJsonText(
      await client.callTool({
        name: 'calculate_booklet_imposition',
        arguments: { pages: 16, mode: 'saddle', readingDirection: 'ltr' },
      }),
    );
    assert.equal(booklet.status, 'valid');
    assert.equal(booklet.result.totalSheets, 4);
    assert.equal(booklet.result.blankPages, 0);

    // 6. calculate_doujin_shipping_thickness
    const doujin = parseJsonText(
      await client.callTool({
        name: 'calculate_doujin_shipping_thickness',
        arguments: { books: [{ format: 'b5', pages: 36, paper: 'joshitsu90', qty: 2 }] },
      }),
    );
    assert.ok(doujin.tTotal > 0);
    assert.ok(doujin.wTotal > 0);
    assert.ok(Array.isArray(doujin.tiers) && doujin.tiers.length > 0);

    // 7. calculate_leather_thread
    const leather = parseJsonText(
      await client.callTool({
        name: 'calculate_leather_thread',
        arguments: {
          pitchMm: 3.38,
          seams: [{ name: 'Wallet edge', mode: 'len', value: 42, leatherThicknessMm: 3.2, qty: 1 }],
        },
      }),
    );
    assert.equal(leather.status, 'valid');
    assert.ok(leather.result.totalCm > 100);

    // 8. calculate_cassette_split
    const cassette = parseJsonText(
      await client.callTool({
        name: 'calculate_cassette_split',
        arguments: {
          tracklist: 'Track 1 3:45\nTrack 2 4:12\nTrack 3 5:01\nTrack 4 4:30',
          format: 'C60',
          mode: 'seq',
        },
      }),
    );
    assert.equal(cassette.status, 'ok');
    assert.equal(cassette.sideA.count + cassette.sideB.count, 4);
  });
});
