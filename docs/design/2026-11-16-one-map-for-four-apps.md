# One map for the four apps (California)

**Owner's decision (2026-11-16):** no satellite photos. One drawn map serves CrashIQ, DemandIQ, StreetCanvas and TrafficOpsIQ. Build California now and get it ready; deploying the apps onto it comes next. The whole USA comes later: about 13–17 GB, roughly $0.10 a month.

## What each app needs

| App | Draws on top | Needs from the map |
|---|---|---|
| CrashIQ | crash points by severity, heat map | street names, intersections, road types |
| DemandIQ | volume bands, turning arrows, count sites | direction, one-way, lane counts |
| StreetCanvas | proposed lanes, bike lanes, sidewalks | centrelines, current lanes, bike lanes, crosswalks |
| TrafficOpsIQ | LOS dots, queues, travel times | signals, stop signs, turn lanes, lanes, speed limits |

## The parts

1. **Base map**: the drawn map already live (Protomaps build of OpenStreetMap, 1.5 GB). No change.
2. **Road details layer**: the traffic-control layer built on 2026-11-15 and removed that night, now restored at the owner's request and renamed "Road details".
   - Contents: signals, stop and yield signs, crosswalks, rail crossings, lane and speed labels, bike lanes and bus stops.
   - The data also carries turn lanes and sidewalks, so the apps can read them.
   - Built from OpenStreetMap by Planetiler (`schema/traffic.yml`, `npm run traffic`, about 385 MB) and uploaded to R2.
   - On by default. Icons appear from zoom 15 and lane/speed labels from zoom 16, so city views stay clean.
   - Every one of the 8 styles gets its own icon colours.
3. **App overlay kit** (`src/layers/overlays.js`): the spec's "drop-in helpers for points, lines, flows".
   - `pointsLayer`: crashes, count sites and LOS dots, coloured by a value or category.
   - `linesLayer`: corridors and volume bands, with width set by a value.
   - `onFeatureClick`: one call to make features clickable.
   - Colours come from the active style's tokens. A 6-step value ramp gives LOS A–F or KABCO severity.
4. **Satellite removed from the demo panel.** The photo files stay in R2 for now (3.3 GB, still inside the free 10 GB), because the later "AI lane tracing" idea uses them.

## Calls I made (owner can overrule)

- **Ramp colours:** the value ramp is one colour set for dark styles and one for light styles, not a ramp per style. LOS and severity must stay readable, so an all-green Matrix ramp would fail.
- **Road details on by default:** the four apps all need it.
- **Phone first-view gate:** it must stay under 2 s with road details on. If it doesn't, the layer starts switched off.
