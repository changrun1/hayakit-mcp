# Hayakit Calculators MCP Server

Official Model Context Protocol (MCP) server for [Hayakit](https://hayakit.com) — providing offline, deterministic calculators for Japanese & Taiwan era conversion, crafting, booklet imposition, camping, and audio cassettes.

- **Registry ID:** `com.hayakit/calculators`
- **Website:** https://hayakit.com
- **Transport:** `stdio` (100% local, zero external API calls, zero telemetry)

## Included Tools

| Tool | Description | Interactive Web Version |
|---|---|---|
| `convert_era` | Western (AD) ↔ Japanese Era (Reiwa/Heisei/Showa/Taisho/Meiji with boundary dates), Taiwan ROC (民國), zodiac, and exact age | [hayakit.com/ja/wareki/](https://hayakit.com/ja/wareki/) |
| `calculate_rosette_ribbon` | Ribbon cutting lengths, pleat counts, outer diameter, and yardage for 1–3 tier can-badge rosettes | [hayakit.com/ja/rosette-ribbon/](https://hayakit.com/ja/rosette-ribbon/) |
| `calculate_paracord_length` | Paracord cutting lengths for Cobra, King Cobra, Fishtail, and Snake weaves (1/2 colors, cm/in) | [hayakit.com/zh-tw/paracord-bracelet/](https://hayakit.com/zh-tw/paracord-bracelet/) |
| `calculate_tarp_guyline` | Camping tarp guyline cut lengths, peg distances, hardware counts, and campsite fit check | [hayakit.com/zh-tw/tarp-guyline/](https://hayakit.com/zh-tw/tarp-guyline/) |
| `calculate_booklet_imposition` | Saddle-stitch and multi-signature booklet sheet imposition order and blank-page padding | [hayakit.com/zh-tw/booklet-imposition/](https://hayakit.com/zh-tw/booklet-imposition/) |
| `calculate_doujin_shipping_thickness` | Book stack thickness (mm), weight (g), and Japanese domestic shipping method eligibility | [hayakit.com/ja/doujin-tsuhan-atsumi/](https://hayakit.com/ja/doujin-tsuhan-atsumi/) |
| `calculate_leather_thread` | Saddle-stitching waxed thread cutting length from seam length/hole count, pitch, and leather thickness | [hayakit.com/zh-tw/leather-thread-calc/](https://hayakit.com/zh-tw/leather-thread-calc/) |
| `calculate_cassette_split` | Audio cassette Side A / Side B track splitting, remaining time, and tape length recommendation (C10–C120) | [hayakit.com/ja/cassette-jikan/](https://hayakit.com/ja/cassette-jikan/) |

## Installation

### Desktop Extension (`.mcpb` — Claude Desktop & compatible hosts)

Download `hayakit-calculators.mcpb` from the [GitHub Releases](https://github.com/changrun1/hayakit-mcp/releases) page and open it with your MCP host app.

### Run from Source

Requires Node.js >= 20.

```bash
git clone https://github.com/changrun1/hayakit-mcp.git
cd hayakit-mcp
npm install
npm run build
```

Add to your MCP client configuration:

```json
{
  "mcpServers": {
    "hayakit": {
      "command": "node",
      "args": ["/absolute/path/to/hayakit-mcp/dist/index.js"]
    }
  }
}
```

## Development & Verification

```bash
npm run typecheck
npm run build
npm test
npm run pack:mcpb
```

## License

MIT © [Hayakit](https://hayakit.com)
