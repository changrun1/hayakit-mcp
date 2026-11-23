import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const stageDir = path.join(root, 'build', 'mcpb');
const outFile = path.join(root, 'hayakit-calculators.mcpb');

fs.rmSync(stageDir, { recursive: true, force: true });
fs.mkdirSync(path.join(stageDir, 'server'), { recursive: true });

fs.copyFileSync(path.join(root, 'dist', 'index.js'), path.join(stageDir, 'server', 'index.js'));
fs.copyFileSync(path.join(root, 'README.md'), path.join(stageDir, 'README.md'));
fs.copyFileSync(path.join(root, 'LICENSE'), path.join(stageDir, 'LICENSE'));

const manifest = {
  manifest_version: '0.3',
  name: 'hayakit-calculators',
  display_name: 'Hayakit Calculators',
  version: '1.0.1',
  description: 'Deterministic Japanese/Taiwan era, craft, booklet imposition, camping, and cassette calculators.',
  long_description:
    'Offline deterministic calculators powered by Hayakit (https://hayakit.com): Japanese & Taiwan ROC era conversion, can-badge rosette ribbon length, paracord bracelet length, camping tarp guyline & footprint, saddle-stitch booklet imposition, Japanese doujinshi shipping thickness, leathercraft saddle-stitch thread, and cassette Side A/B track splitting.',
  author: {
    name: 'Hayakit',
    url: 'https://hayakit.com',
  },
  repository: {
    type: 'git',
    url: 'https://github.com/changrun1/hayakit-mcp',
  },
  homepage: 'https://hayakit.com',
  documentation: 'https://github.com/changrun1/hayakit-mcp#readme',
  license: 'MIT',
  keywords: ['calculators', 'japanese-era', 'wareki', 'craft', 'booklet', 'camping', 'cassette', 'mcp'],
  server: {
    type: 'node',
    entry_point: 'server/index.js',
    mcp_config: {
      command: 'node',
      args: ['${__dirname}/server/index.js'],
    },
  },
  tools: [
    { name: 'convert_era', description: 'Convert Western, Japanese era, and Taiwan ROC years with zodiac and age.' },
    { name: 'calculate_rosette_ribbon', description: 'Calculate ribbon cutting length and pleats for can-badge rosettes.' },
    { name: 'calculate_paracord_length', description: 'Calculate paracord cutting length for Cobra/King Cobra/Fishtail/Snake weaves.' },
    { name: 'calculate_tarp_guyline', description: 'Calculate camping tarp guyline cut lengths and footprint fit.' },
    { name: 'calculate_booklet_imposition', description: 'Calculate saddle-stitch and multi-signature booklet page imposition.' },
    { name: 'calculate_doujin_shipping_thickness', description: 'Calculate book stack thickness, weight, and Japanese mail shipping options.' },
    { name: 'calculate_leather_thread', description: 'Calculate waxed thread cutting length for leathercraft saddle-stitching.' },
    { name: 'calculate_cassette_split', description: 'Split a tracklist across cassette Side A and Side B with remaining time.' },
  ],
  compatibility: {
    platforms: ['darwin', 'win32', 'linux'],
    runtimes: {
      node: '>=20.0.0',
    },
  },
};

fs.writeFileSync(path.join(stageDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');

const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
execFileSync(npxCmd, ['mcpb', 'validate', path.join(stageDir, 'manifest.json')], { stdio: 'inherit', shell: process.platform === 'win32' });
execFileSync(npxCmd, ['mcpb', 'pack', stageDir, outFile], { stdio: 'inherit', shell: process.platform === 'win32' });

const sha256 = createHash('sha256').update(fs.readFileSync(outFile)).digest('hex');
console.log(`\nMCPB built: ${outFile}`);
console.log(`fileSha256: ${sha256}`);
