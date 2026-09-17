# FTC Event Schedule Builder

A schedule builder for *FIRST* Tech Challenge event directors. Set your team count,
qualification matches per team, judging and inspection capacity, and match blocks, and get a
minute-by-minute event timeline, per-team judging and inspection slots, and a list of every place
the schedule conflicts with the competition manual.

Every timing rule is checked against the [2026-2027 BIOBUZZ Competition Manual, V1][manual], and
every constant lives in [`src/lib/manual.ts`](src/lib/manual.ts) with the section or rule number it
comes from — so the numbers are auditable, and updating for a new manual release is one file.

[manual]: https://ftc-resources.firstinspires.org/ftc/game/cm-html/BIOBUZZ%20Competition%20Manual%20-%20V1.htm

## Two things it deliberately doesn't do

**It doesn't generate match pairings.** Which four teams play in each qualification match is left to
FIRST event management software, whose algorithm balances partner and opponent repeats against the
T406 minimum break (§13.6.2). This tool budgets the time those matches take; it doesn't try to
replace that scheduler.

**It doesn't run matches in parallel.** Only one match is played at a time, no matter how many
fields you have. Extra fields let the next field be reset and staged while the current match plays,
which lowers the achievable cycle time — so field count here only influences the *suggested* cycle
time, never the length of a match block.

## Rules enforced

| Rule | What |
|---|---|
| §10.4 | Match periods — 0:30 auto + 0:08 transition + 2:00 teleop = 2:38 of play |
| §13.6.1 | 5 or 6 qualification matches per team; schedule published 15 min before quals |
| §13.6.2 | Surrogates assigned when teams × quals isn't divisible by 4 |
| §3.3 | Scheduled practice matches may be played before passing inspection; filler-line ones may not |
| T406 | 5-minute minimum break between a team's qual matches, 8 minutes in playoffs |
| I102 | Check-in closes 45 minutes before qualification matches — or rolls per team, see below |
| A205 / A207 | Interviews at least 10 minutes, equal for every team; first 5 uninterrupted |
| Table 13-2 | Playoff alliances: 4–10 → 2, 11–20 → 4, 21–40 → 6, 41–64 → 8 |
| Tables 13-3…13-6 | Playoff bracket timing — the default round cadence, finals slot, and award breaks |

Anything the manual leaves open — field reset time, inspection duration, ceremony lengths, lunch —
is configurable, with conventional (not authoritative) defaults.

## Routes

| Route | Description |
|---|---|
| `/` | The schedule builder: config, summary stats, compliance findings, timeline, team slots |
| `/about` | Manual citations, and what the manual leaves to the director |

## Development

Requires **Node 24** and **pnpm 12** (both pinned in `package.json`; Corepack will fetch pnpm).

```sh
pnpm install
pnpm dev
```

Other scripts:

```sh
pnpm build     # vue-tsc type check, then vite build
pnpm preview   # build, then serve through the Worker locally
pnpm deploy    # build and deploy to Cloudflare
```

The app is entirely client-side — no API, no backend, no keys. It deploys as a Cloudflare Worker
serving static assets, with `not_found_handling: "single-page-application"` so client-side routes
resolve on deep links.

Config persists to `localStorage`, so reloading keeps your event. **Share** copies a link with the
whole configuration encoded in it, so you can send a colleague a specific scenario.

**Printing** is scoped. *Print all* in the header covers the whole page; the event schedule and the
judging/inspection tables each have their own *Print* button that prints only that section, so you
can post the day's schedule and hand judges their slot list without one carrying the other. Every
printout keeps the event name and date header. Browsers offer "Save as PDF" as a print destination,
so this covers PDF export too. The print stylesheet hides inputs, switches to light colours, keeps
the Gantt and status pills in colour, and repeats table headers across pages.

The schedule table collapses runs of back-to-back playoff matches into a single row by default, since
a full bracket is a dozen near-identical six-minute rows; **Expand playoffs** shows every match. CSV
export always contains the full uncompressed schedule regardless of that setting.

**Match blocks** can be sized three ways, following FTC Live: a fixed match *count*, a wall-clock
*end time* (the block runs until then, fitting as many whole cycles as it can), or *remaining* to
absorb whatever the other blocks leave. A block's *start* is never something you set — it's wherever
the schedule reaches it — so growing an earlier block automatically shrinks a later window block
rather than creating a conflict. If a window block's end time has already passed by the time the day
gets there, it holds no matches and you get an error saying so.

**Check-in** has two modes. The default is I102 as written — check-in closes 45 minutes before
qualification matches. The alternative is *rolling*: check-in stays open and each team is simply due
before its own judging slot, which is how Massachusetts and some other regions run. This isn't a
deviation — I102 sets the 45-minute deadline "unless otherwise specified or approved by the Event
Director." In rolling mode the 45-minute check is replaced by the one that actually binds: that the
earliest judging slot leaves teams a window in which to check in.

**Playoff bracket timing** is three inputs, because the manual's tables use three different gaps:
the *round cycle* between consecutive matches, the *finals slot* for a match running immediately
before an award break, and the *award break* length. Defaults reproduce Tables 13-3…13-6 exactly,
including the two rounding quirks in Table 13-4. Finals never follow the round cadence — they always
precede a ceremony, and the field is reset during it — which is why they need their own control. In a
2-alliance bracket *every* match is a finals match, so the round cycle does nothing there.

Judging and inspection can run either in a dedicated window before matches or concurrently with
qualification matches. When judging has a dedicated window, practice matches can be set to run
alongside inspection and judging rather than after them — §3.3 permits teams to play *scheduled*
practice matches before passing inspection.

## Credits

UI conventions and build setup follow the sibling [CycleTimeReport](../CycleTimeReport) project.

## License

GPL-3.0-or-later
