# AI Transportation Tools: the agentic platform, end to end

Status: design draft for the owner's approval, 2026-11-15. Comes from the brainstorm of the same day. Builds on, and
does not replace: `docs/AGENT.md` (agent rules and jobs), `docs/V10.md` ("ask a street"), `contract/` (the shared
corridor file `aitt-corridor/0.1`), and the StreetCanvas wave plan (street-canvas milestone "Wave 1").

Marked **[owner]** = the owner said it. Marked **[Claude's call]** = proposed here, the owner can overrule it.

---

## 1. Intent: what this is and why

**The long-term picture [owner].** A real agentic platform for PlanGineers. The tools do the analysis by themselves,
keep learning and keep getting better instead of staying fixed. People use it three ways:

1. **On the website**, they switch between agents to fit the job.
2. **From outside**, an engineer already working in ChatGPT, Claude or another assistant plugs into the platform,
   and their own agent runs the analysis through it, without opening the website.
3. **Over time** the tools learn from every use (accept / reject, corrections).

**The feel [owner].** Fast and straightforward, "touch and it plays" like Spotify: tap a street or an intersection
and the right thing happens, with no setup screens. Most of the work happens on maps, so the map has to look very,
very good in the house theme (Signal Flow), with layers the user controls. It must not look lame.

**The business [owner].** Free and open source, paid for by ads. California first.

**Why now [owner].** The tools break today: CrashIQ crashes when you enter an intersection or corridor, the
StreetCanvas map view leads nowhere, zoomed-in maps show no street or place names, and Crash and Demand are not
reachable most of the time. Nothing agentic can stand on tools that don't work. So: **fix what breaks first, then
build the map platform, then the agent layers, step by step.**

## 2. Goals, non-goals, anti-goals

**Goals**
- Every tool's main path works end to end, every time, before anything new is added.
- One map platform of our own (tiles, style, hosting) used by every tool and the website.
- Every tool's engine callable as clear actions, so our own agent and outside agents use the same thing.
- A learning loop that is measured (scorecard), not assumed.
- Each new tool or add-on costs less to build than the one before it.

**Non-goals (now)**
- All 50 states. California first; other states are an add-on later (section 9).
- Drawing streets from scratch. Street data comes from OpenStreetMap, like Apple, Mapbox and Esri do.
- Statewide aerial photos up front (~1 TB). Fetched per corridor first (section 6).
- A chatbot. AGENT.md: "not a bot, it should help the user."
- Training our own model.

**Anti-goals (it fails even if it technically works)**
- A number on screen that the AI made up. Code computes every number (AGENT.md rule, unchanged).
- A map that goes dark when the owner's PC is off.
- A pretty map that is slow on a phone, or a fast one that looks generic.
- Ads that clutter the work screen (the minimalism rule: every element has a purpose).
- Outside agents running our compute or AI for free without limits, so a free product gets a surprise bill.
- Four tools that each solve the same problem their own way (four map setups exist today).

## 3. Constraints

- **Money: $0 a month [owner, 2026-11-15].** Free tiers and open source only. Tool backends and their data stay on
  the owner's drive and PC; an analysis reads the data from the drive when it runs, with no copy in the cloud. Agents
  later use a free model running on the owner's machine; revisited only when the platform gets there.
- **Who builds:** Hermes writes and builds; Claude Code reviews each unit; the owner merges (CLAUDE.md,
  factory roles). Street Canvas stays on the v2 factory during wave 1.
- **One tool on the website at a time** until it is finished (BRIEF 2026-11-12). Today: StreetCanvas.
- **Theme:** Signal Flow tokens, Overpass fonts, dark default. Signal colors carry meaning only.
- **Data licences:** OpenStreetMap is ODbL (credit on every map; a changed OSM database we publish must stay open).
  NAIP imagery is public domain. CCRS crash data is open data.
- **Hardware:** the owner's Windows PC builds data. Tool backends run there today through a Cloudflare Tunnel.

## 4. The whole system in one picture

```
                         ┌──────────────────────────── PEOPLE AND AGENTS ───────────────────────────┐
                         │  Website user          Outside agent (ChatGPT, Claude, ...)    Our agents │
                         └──────┬─────────────────────────┬──────────────────────────────────┬──────┘
                                │ taps, asks              │ MCP connection                   │
 LAYER 6  AGENTS                ▼                         ▼                                  ▼
          site guide · specialist agents (Crash, Demand, Street, Traffic) · planner (V10 chain)
          agent switcher on the site · insight cards · Ask panel
                                │  every agent calls only ↓ actions, never a database or a formula
 LAYER 5  ACTIONS (the one door)
          one catalogue: pull_crashes(corridor), place_crash(id), balance_counts(file), compute_los(ix),
          check_layout(street), ... each with a typed input/output, cost cap, log entry, version
          exposed twice from the same code: as HTTP for our site, as an MCP server for outside agents
                                │
 LAYER 4  TOOL ENGINES (code computes every number)
          StreetCanvas · CrashIQ · DemandIQ · TrafficOpsIQ · later add-ons (section 9)
                                │ read and write ↓
 LAYER 3  SHARED PROJECT
          the corridor file (aitt-corridor/0.1) · one login · project store · lesson files
                                │
 LAYER 2  MAP PLATFORM
          basemap file (vector tiles) · our layers · one style in Signal Flow · map kit (MapLibre)
                                │
 LAYER 1  DATA
          OpenStreetMap CA · CCRS crashes · counts · NAIP photos per corridor · Census/TIGER · HPMS
 ─────────────────────────────────────────────────────────────────────────────────────────────────
 ACROSS ALL: the learning loop (every action + accept/reject logged → scorecard → approved rules)
```

**The one idea that holds it together [Claude's call]:** layer 5, the action catalogue, is the only door. Our
website agent, a specialist agent, the planner and an outside ChatGPT or Claude agent all call the same actions.
So the agent work is built once, every call is logged the same way (that is the learning loop), and every cost
cap and safety check sits in one place.

## 5. Approaches considered (map platform)

| | What | Trade-off |
|---|---|---|
| **A. Shared map kit, tiles on Cloudflare R2** | California vector tiles in one file on R2; one style; one front-end kit every tool uses | Stays up when the PC is off; one fix reaches every tool. Cost: each tool's own markers and lines move from Leaflet to MapLibre |
| B. Same, tiles served from the home PC | Everything on the local drive | Free, but the map dies with the PC, which is part of why Crash and Demand are down now. Kept only as a backup |
| C. Patch now, then A | Add Esri's label layer today so names show; build A after | Usable tools this week; Esri stays a few more weeks |

**Picked: A, built first as its own project [owner, 2026-11-15].** The owner picked "own the tiles, style and
hosting, show it with MapLibre" and wants it fully customisable in the theme. Only vector tiles allow that (Esri's
raster tiles can't be restyled). C's label patch is dropped: the map goes first instead.

## 6. The map platform (layer 2) in detail

**Pipeline (runs on the owner's PC, only when data changes):**
1. Download the OpenStreetMap California extract (Geofabrik, about 1 GB).
2. Build vector tiles with **Planetiler** (open source, Java) into one file, `california.pmtiles` (a few GB).
3. Build our own data layers the same way (`aitt-layers.pmtiles`) where they are static, such as the CCRS crash
   points statewide.
4. Upload to a **Cloudflare R2** bucket. Fonts and icons go with it.
5. A version number on every build; the style points at a version, so a bad build rolls back by changing one line.

**Hosting.** PMTiles is a single file read in pieces over HTTP: no tile server, nothing to crash. R2 charges nothing
for traffic out. Its free tier (10 GB stored, millions of reads a month) covers California for a long time.

**Map kit (one front-end package, used by every tool and the website):**
- MapLibre GL, the open-source map renderer.
- **One style file written in Signal Flow tokens**: road colors and widths, glow, labels, 3D buildings, water,
  land. A style is code, so the look is ours. Several styles are possible (night, day, plan sheet, print).
- **Layer registry:** each tool registers its layers (crash points, volume flows, LOS dots, lane layout). The user
  turns them on and off in one switcher.
- **Tap model ("touch and it plays"):** tap a street → it is selected and the tool's main action starts; tap an
  intersection → the same for the intersection. No setup screen in between.
- **Measure tool [owner]:** distance along a drawn line, area of a drawn shape, and street width curb to curb,
  shown in feet (metres as an option), computed on the ground, not on screen pixels.
- **Layer control [owner]:** a switcher for basemap styles and data layers, each with on/off and opacity.
- **Where it lives:** the standalone map repo (section 7).

**Data the tools serve.** Results that change per study (a corridor's crashes, a volume run) stay in each tool's
backend and come to the map as GeoJSON. Only the basemap and static statewide layers are files on R2.

**Aerial photos.** NAIP per corridor on demand (a small area at a time, cached), not the 1 TB statewide download.
The statewide set is a later decision, once a tool needs it everywhere (e.g. AI lane tracing, section 9).

## 7. The phases: when and how

Each phase has an entry gate and an exit gate. A phase does not start until the one before has met its exit gate.
Hermes builds; Claude reviews after each unit; the owner merges.

| Phase | What ships | Exit gate (what "done" means) |
|---|---|---|
| **1. The map, on its own (first) [owner, 2026-11-15]** | A standalone map project, separate from every tool: pipeline, basemap file, map kit, the first Signal Flow style, and a demo page that shows it off. Built in: **layer switching** (basemap styles and data layers on/off) and **measuring** (distance along a line, area, and the width of a street from curb to curb). Very nice to look at is a requirement, judged by the owner on mockups first | The demo page shows California with names at every zoom, switches layers, measures distance and area within 1% of a known length, looks right to the owner, and a phone shows the first view in under 2 s |
| **0. Stop the breaking** (alongside phase 1) | (a) StreetCanvas wave 1 as already ordered (#81, #82, #74, #58, #1, #83, #77, #76, #75). (b) A breakage sweep of CrashIQ (DemandIQ once it is un-paused): **Claude** reproduces every crash and dead end and writes one ranked list with causes; it changes no code [owner, 2026-11-15]. Hermes fixes in that order. (c) Each tool's main path gets an end-to-end test in CI | Each tool's main path works on a real California corridor, on desktop and phone, 10 runs in a row, and its end-to-end test passes |
| **1b. Tools move onto the map** | StreetCanvas first (the one live tool), then Crash, then Demand, then TrafficOpsIQ, then the website. Esri removed | Every tool shows our map; nothing still loads Esri |
| **2. Shared project and login** | One login (free tier), the corridor file saved once and opened by every tool. Backends stay on the owner's PC ($0 rule) | A corridor saved in StreetCanvas opens in Crash and Demand with no re-entry |
| **3. Action catalogue** | Each tool's engine wrapped as typed actions (input/output schema, version, cost cap, log entry). The site's buttons call them too | Every main-path step of every tool can be run by calling actions alone, with no screen, and the result matches the screen |
| **4. Outside agents (MCP)** | An MCP server over the action catalogue. Per-user keys, rate limits, a free quota | An outside Claude or ChatGPT agent runs a full crash profile for a corridor from a prompt, within the quota |
| **5. Our agents** | The site guide, specialist agents and the switcher; insight cards; then the planner chain (V10); the Ask panel last (AGENT.md order) | Each agent job passes its known-answer test (AGENT.md "tested before shown") |
| **Always on, from phase 0** | The learning loop: lesson files kept current; from phase 3, every action and accept/reject logged; weekly scorecard per job | The scorecard shows a trend per job; nothing is learned without the owner's approval |

**Order [owner, 2026-11-15]:** the map comes first, on its own. StreetCanvas wave 1 keeps going as it is, and the
CrashIQ sweep runs alongside as an investigation that produces a list, not code. The Esri label patch is dropped:
the map project replaces Esri instead. DemandIQ stays paused until the owner says otherwise.

**Where the map project lives [Claude's call]:** its own repo (`repos/aitt-map`), because the owner wants the map
separate from every app. It holds the pipeline, the style, the kit and the demo page, and publishes the kit for the
tools to install in phase 1b.

**Where the basemap file is served [Claude's call]:** the basemap is the one thing worth putting on Cloudflare R2.
It is free at this size ($0 rule holds) and keeps the map up when the PC sleeps. Serving it from the PC is the
fallback, and the kit works with either address.

## 8. Hurdles, in advance

| Hurdle | Why it bites | What we do | When |
|---|---|---|---|
| Fixes don't stick | Tools broke before, quietly | End-to-end test per main path in CI (phase 0 exit gate); nothing merges red | 0 |
| Home PC is the server | Tools die when it sleeps; one machine is one failure ($0 rule keeps backends there) | Basemap on R2 so the map stays up; the PC set never to sleep; a clear "tool offline" message instead of a crash; revisit hosting when there is revenue | 1–2 |
| Leaflet → MapLibre move | Each tool's markers, lines and clicks are written for Leaflet | One tool at a time, StreetCanvas first; the kit gives drop-in helpers for points, lines, flows | 1 |
| Labels and look | OSM names are uneven; good label placement is hard | Start from an open style that already labels well (Protomaps basemap), restyle it in our tokens, then refine | 1 |
| Planetiler on Windows | Java, memory, a long first run | California fits on a normal PC (a few GB of RAM); a script that runs it the same way each time | 1 |
| Free-tier limits | R2, login and host free tiers have ceilings | Track usage monthly; R2 is cheap past free; alarm before a paid tier is reached | 1–4 |
| OSM licence | ODbL credit and share-alike rules | Credit on every map; our own layers kept as separate files, not merged into the OSM database | 1 |
| Ads | Few visitors in a niche earn little; banners fight the minimal look | Ads only on the public pages, never on the work screen; decide the model before phase 4 (open decision 1) | before 4 |
| AI cost on a free product | Every agent answer costs money | Per-user and per-study caps in code (AGENT.md); cheap model for routing, better model only where tested | 4–5 |
| Outside agents abuse it | An MCP door lets anyone run our engines | Keys, rate limits, a free quota; heavy actions cost more quota | 4 |
| Agents saying wrong numbers | Engineers would rely on them in submittals | The rule stays: agents only quote numbers from action outputs; a verifier rejects an unsourced number; a disclaimer on every export | 3–5 |
| Prompt injection | Crash free text and uploaded PDFs can carry instructions | CrashIQ #55 guardrails apply to every agent; action inputs typed and checked | 3–5 |
| MCP and model churn | Standards and models change fast | Actions are plain HTTP + JSON schema underneath; MCP is a thin wrapper that can be swapped | 4 |
| Scope creep | Four tools, many ideas, one builder line | The phase gates; one tool on the site at a time; add-ons wait for phase 3 (section 9) | always |
| Builder throughput | Hermes runs the line; reviews take rounds | Small units, reviewed one at a time; the factory lessons file updated after each | always |

## 9. Future add-ons, and how the platform absorbs them

**How an add-on plugs in (the efficiency) [Claude's call].** After phase 3, a new tool or add-on is four things,
and nothing else:
1. its **engine** (code that computes),
2. its **actions** added to the catalogue (so our agents and outside agents get it for free),
3. its **map layers** registered with the kit (so it looks native with no map work),
4. its **lessons file** and known-answer tests (so it learns and is checked like the others).

It reads and writes the shared corridor file, so it can chain with every tool already there. The fourth tool should
take a fraction of the effort of the first because the map, login, project, agent door and logging already exist.

**Add-ons worth planning for** (none is approved; each comes back through the owner):

| Add-on | What it does | What it reuses |
|---|---|---|
| Video counts (traffic-vision repo) | Turning-movement counts from intersection video | Feeds DemandIQ volumes in the corridor file |
| Transit (GTFS feeds) | Stops, routes, headways; bus delay on the corridor | Map layers; TrafficOpsIQ delay |
| Bike and walk | Low-stress network, school routes, ped counts | StreetCanvas layouts; CrashIQ ped/bike crashes |
| Grant writer (HSIP, SS4A, ATP) | Matches a corridor to funding and drafts the case | CrashIQ HSIP outputs; V10 Money layer |
| SB 743 VMT screening | VMT screening and induced travel | TrafficOpsIQ already plans it |
| Speed and safety screening | Statewide high-injury network | CrashIQ statewide data on the map |
| AI lane tracing from photos | Reads lanes and curbs from NAIP | StreetCanvas existing-conditions; this is the case for the 1 TB set |
| Plan sheets and CAD (DXF) | Engineer-ready drawings | StreetCanvas wave 2 already lists it |
| Council packet | One PDF quoting every tool's result | V10 decision card |
| Other states | Crash data and rules for more states | CrashIQ all-states research; the corridor file is not CA-specific |
| Signal timing | Timing plans and retiming options | TrafficOpsIQ engine |

## 10. Decided, and left to the builder

**Decided:** phases and gates (section 7), map first; $0 a month; the action catalogue as the one door (section 4);
A for the map (section 5); R2 + PMTiles + Planetiler + MapLibre (section 6); code computes every number (unchanged); StreetCanvas
first on the new map.

**Settled after the builder check [Claude's call]:**
- **Where the action catalogue runs.** Each tool backend exposes its own actions with one shared description format
  (input/output schema, version, cost). A thin gateway in front of them (a Cloudflare Worker) holds the parts that
  must be in one place: keys, quotas, cost caps, the log, and the MCP server. Engines stay in their own repos.
- **How the map kit reaches other repos.** Published as a versioned npm package from the map repo (GitHub Packages or
  a git dependency); each tool pins a version.
- **TrafficOpsIQ.** Not in phase 0 (it isn't live). It moves to the map kit in phase 1 with the others and joins the
  shared project in phase 2, because it makes the corridor file's first copy from OpenStreetMap.
- **CrashIQ and the corridor file.** In phase 2 CrashIQ only reads the centreline and intersections. A crash section
  in the file, if needed, is a contract change that goes to the owner first.
- **"One tool on the site at a time"** is about what the website links to. Fixing and testing tools off the site
  goes ahead in parallel; a tool is linked from the site only when it is finished.

**Left to the builder:** the map kit's folder and package name; the exact style values within the Signal Flow tokens
(reviewed visually with the owner); the login service and backend host, chosen by price at phase 2; the action
naming scheme; the test framework per tool.

## 11. Open decisions for the owner (not needed to start phase 0)

1. **How ads work:** public pages only, or also inside tools; or a different model for agencies vs consultants
   (V10 floated free for small agencies, paid for consultants). Needed before phase 4.
2. **Open source scope:** which parts are open (map kit and style are natural; engines?) and the licence.
3. **Agent switching:** does "switch agents" mean picking a specialist (Crash agent, Street agent), picking an AI
   model (Claude, GPT), or both?
4. **Map style direction:** decided visually at the start of phase 1 (mockups in the browser).
