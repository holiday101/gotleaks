# Got Leaks AI — Feature Backlog / Notes

Raw notes from Jared, captured 2026-09-10 and grouped by theme. Original wording kept
where the intent is clear; open questions noted where it isn't.

## Resident notifications

- Send residents an email with **yesterday's water usage** (daily usage digest).
- When sending that email, need to be able to **select multiple users** at once (not
  one-by-one).
- This is the first concrete step toward the project's "notify residents" goal — see
  `project-overview.md`'s Gaps section, which flagged that nothing resident-facing
  exists yet.

## Water Usage tab

- **Made leaderboard-friendly, with 7-day average and zone filter — done 2026-09-13.**
  The tab used to be just a single-meter dropdown + chart. Now it opens with a ranked
  table (highest usage first, sortable by clicking any column header) of every meter
  with usage in the trailing 7 days: rank, customer, address, account, meter, lot
  zone, 7-day total gallons, **7-day average (gal/day)** (total ÷ 7 days), and reading
  count for that window. Sourced from the already-precomputed `meter_leak_status`
  table, so no new heavy query. Added a lot-size zone filter (multiselect, including a
  "No parcel match" bucket for the ~3% of meters with no matched parcel). Clicking a
  row renders that meter's usage chart below, same pattern as the Continuous Users
  tab. The original single-meter dropdown is kept underneath for direct lookups.
  - Note: a handful of large accounts (Macey's, Providence Plaza, Zollinger Park Ball
    Field) show a huge 7-day total from just 1 reading that week, not real sustained
    usage — likely a bulk/reset-style reading. The "readings this week" column makes
    this visible rather than hiding it behind a misleading average; not filtered out
    since it wasn't asked for and could hide a legitimately large single correction.
  - This also functionally covers part of the Analytics/leaderboards item below
    ("who is highest by total consumption") and gives another angle on the Kathleen
    Alder side-finding under Continuous Users — total-volume ranking now exists, just
    on this tab rather than merged into the Continuous Users sort.
- **Nearby-meter usage comparison — done 2026-09-13.** Every meter-detail chart view
  in the app (this tab's single-meter lookup and leaderboard click-through, and the
  Continuous Users tab click-through — they all share one render function) now has a
  "Compare to nearby meters" expander. Ranks the N nearest meters (5/10/20/50,
  selectable) by straight-line distance from the utility's surveyed GPS locations
  (93% coverage — 2,477 of 2,652 meters with usage data have a usable coordinate;
  the rest were only string-matched to a parcel, with no coordinate to measure from)
  and shows each one's distance, address, lot-size zone, and 7-day total/average
  usage, plus a one-line comparison against the selected meter's own 7-day average.
  - **This is the sharpest signal found yet for surfacing a case like Kathleen
    Alder's**, sharper than either the floor-rate sort or the total-volume
    leaderboard: she averaged **4,253 gal/day** this week vs a **614 gal/day**
    average among her 10 nearest meters — about **6.9x higher**. Neither the
    Continuous Users floor sort (rank #53 by 3-hr rolling floor) nor the Water Usage
    total-volume leaderboard puts her anywhere near the top, because both get
    dominated by large commercial/HOA accounts — but a same-neighborhood comparison
    isn't affected by that at all, since it only compares her to houses of a similar
    scale nearby.
  - Not yet built: this comparison lives inside the per-meter detail view, so you
    have to already be looking at a specific meter to see it. Turning "usage vs.
    neighborhood average" into its own leaderboard/flag column (e.g., "ratio to
    nearby average" as a sortable metric across all meters) would surface cases like
    Kathleen's without needing to already suspect them — flagging as a natural next
    step, not built yet.

- **Week/month toggle + daily breakdown — done 2026-09-15.** Jared asked for the
  leaderboard and meter-reading views to break usage down by day (so a spike is
  visible day-by-day, not just baked into a total/average) and to be able to toggle
  between a week and a month of data, with the day-by-day values showing near the
  nearby-meter comparison.
  - The Leaderboard heading now has a **Last 7 days / Last 30 days** toggle. Picking
    30 days re-ranks and re-labels the table (total/avg/reading-count columns and the
    window caption) off a live 30-day aggregation instead of the precomputed 7-day
    `meter_leak_status` table — kept cheap by filtering on the indexed date column
    (~1s measured city-wide against 2,600 meters / 11M+ rows), so it doesn't need its
    own precomputed table the way the 7-day figures do.
  - The "Compare to nearby meters" expander (shared by the leaderboard click-through,
    the Continuous Users click-through, and the single-meter lookup) now has its own
    **Last week / Last month** toggle, which drives both the neighbor total/avg
    columns (previously hardwired to 7 days) and a new **"Daily usage — this meter"**
    bar chart + table directly below the neighbor comparison table — per-day totals
    for the selected meter over that same window, so you can see which specific days
    drove the total rather than just the average.
  - Not yet built: the two toggles are independent (the leaderboard's window doesn't
    change what the drill-down chart defaults to, and vice versa), and the daily
    breakdown is per-meter only — it doesn't show a same-window daily breakdown for
    the neighbors themselves, just their totals/averages.

## Continuous Users tab

- ~~Needs address and/or contact info shown alongside each continuous-leak meter.~~
  **Done 2026-09-11:** the table now shows address, phone (primary, falling back to
  secondary), and email next to each entry, sourced from `customer_billing` same as
  the Customers tab. Coverage on the current qualifying list (≥10 gal/hr): 184/184
  have an address, 163/184 a phone, 119/184 an email.
- ~~Kathleen Alder spike — check it got flagged.~~ **Checked 2026-09-11: yes, and
  it's serious.** She's been continuously non-zero since **2026-06-25** (streak
  ongoing as of the last sync) and is currently rank #42 of 926 qualifying meters by
  the lowest-hourly-reading floor (39.3 gal/hr) — but that floor understates it badly.
  Her trailing-7-day total was **29,774 gallons**, with hourly peaks over 1,000 gal/hr
  repeatedly and daily totals commonly 3,000–6,700+ gallons/day. Looking at her full
  2-year history, spikes over 300 gal/hr appear from nearly the start of the dataset
  (2024-08-21) through the most recent reading (2026-08-21) — this reads as a
  long-running, severe issue, not a one-day event, matching "spiked and then kept
  going" exactly. Meter `1577593174`, account `6075001`, 232 South 200 East, phone
  801-864-5562. **Worth a call/visit regardless of what the app shows** — this is
  well past "worth a look."
  - Side finding: sorting purely by the lowest-hourly-reading floor (the app's
    current sort) is why a case this severe by total volume doesn't show up near the
    top of the list — a genuinely large but *spikier* leak (like hers) can rank behind
    a smaller but steadier one. Might be worth also sorting/flagging by total weekly
    consumption, not just the floor. Not changed yet — flagging for a decision. (A
    total-volume ranking now exists on the Water Usage tab's new leaderboard, see
    above — but it isn't merged into this tab's own sort/filter. The nearby-meter
    comparison below turned out to be a much sharper way to catch her case than
    either sort.)
- **Meter-reading artifact found + 3-hour rolling floor added — done 2026-09-12.**
  Digging into Kathleen's data to find her "real" leak size surfaced a data-quality
  issue: individual hourly readings can under-report, with the shortfall showing up
  ("made up for") in the very next hour's reading. Concretely, her 13:00 reading was
  39.3 gal/hr (the single lowest reading in her week, and what the app's floor sort
  used) followed by 66.3 gal/hr at 14:00 — averaging to the ~52.8 gal/hr the meter
  was actually running at that stretch. Taking the literal minimum single-hour
  reading as "the floor" can badly understate a leak whenever this artifact hits the
  lowest reading in the window.
  - **Fix:** added a 3-hour rolling-average minimum (`roll3_min_consumption`) —
    the smallest value of "this reading averaged with its two immediate neighbors,"
    computed once per sync alongside the existing weekly stats. This absorbs
    single-hour reporting glitches while still being a legitimate "sustained floor"
    statistic (it doesn't just pick a bigger number — a real, low, single reading
    surrounded by other low readings still comes through low).
  - **Validated city-wide, not just for one customer:** compared raw floor vs.
    3-hour rolling floor across all 926 currently-qualifying meters. 652 of 926
    shift by more than 20% between the two measures — this is common, not a one-off.
    Under the 10 gal/hr bar, qualifying meters go from 184 (raw) to 227 (rolling);
    under 5 gal/hr, from 308 to 376.
  - **Kathleen:** raw floor 39.3 gal/hr → rolling floor 46.2 gal/hr. Her rank among
    10+ gal/hr qualifiers actually moves slightly *down*, from #42 (raw) to #53
    (rolling) — the smoothing gives a more accurate number but doesn't by itself make
    a spiky-but-large leak like hers stand out; see the nearby-meter comparison above
    for what actually does.
  - **Rebecca Nummer** (checked as a second validation case): raw floor 188.2 gal/hr
    → rolling floor 232.5 gal/hr.
  - **Now live in the app:** the Continuous Users tab shows both "lowest hourly
    reading" (raw) and "3-hr rolling floor" (smoothed) as columns, with a sort
    control to switch between them — the 5/10 gal/hr threshold filter applies to
    whichever one is currently selected.

## Map & property data

- **Click on the map** → show lot size and more property info for that parcel/meter.
- ~~Put lot size into the customer data.~~ **Done 2026-09-11:** the Customers tab's
  query now joins `parcels.area_sqft` (via `meter_parcels`) into every row as
  `lot_size_sqft`, plus a computed `lot_zone`/`lot_zone_label` (see Billing / rates
  below). Covers 2,613 of 2,698 customers (97%, matching the existing parcel-match
  rate) — the rest have no matched parcel yet.
- Add **zoning** data (not currently sourced from anywhere — need a data source, e.g.
  a zoning layer from the county GIS).
- ~~Let someone look at what a customer's neighbors are using.~~ **Done 2026-09-13**
  — see "Nearby-meter usage comparison" under Water Usage tab above.

## Analytics / leaderboards

- **Who is highest** in each usage category (continuous leak rate, total consumption,
  etc. — "categories" plural, so probably more than one ranking). **Partially done
  2026-09-13:** the Water Usage tab's new leaderboard (see above) covers "highest by
  total consumption," with a lot-size zone filter. Continuous-leak-rate ranking still
  lives only on the Continuous Users tab (by raw or 3-hr rolling floor). No single
  unified leaderboard across categories yet, and no leaderboard yet for "highest
  relative to neighborhood average" — see the nearby-meter comparison note above for
  why that one in particular looks promising.
- What is the **average lot size** for the city.
- Rank/bucket customers by the lot-size / building-size zones defined below (Billing /
  rates), e.g. "who's the highest user within the 8,000–10,000 sq ft lot zone." The
  Water Usage tab's zone filter now lets you narrow the leaderboard to one lot-size
  zone and see who's highest within it — building-size zone filtering isn't there yet
  (no building-size data, see Billing / rates below).

## Billing / rates

- **Lot-size zones — done 2026-09-11:** 7 zones, by lot (parcel) size in square feet,
  meant to set a reasonable-irrigation baseline per property size for the conservation
  pricing idea below. Implemented as a `lot_size_zones` reference table (editable
  without a code change — update the bounds there, not in a query) and joined live
  into the Customers tab query:
  1. 0 – 6,000
  2. 6,000 – 8,000
  3. 8,000 – 10,000
  4. 10,000 – 12,000
  5. 12,000 – 24,000
  6. 24,000 – 48,000
  7. 48,000+
- **Building-size zones — infrastructure built 2026-09-11, data not available yet:**
  Jared asked for 8 zones by building (structure) square footage: every 1,000 sq ft
  up to 6,000, then 6,000–10,000, then 10,000+. Same pattern as lot-size zones — a
  `building_size_zones` reference table plus a `bldg_zone`/`bldg_zone_label` join, and
  a new (currently empty) `parcels.building_sqft` column for it to read from — are all
  in place and ready. **But building square footage isn't in any of the data sources
  currently imported**: checked the parcel GeoJSON import (only pulls parcel
  ID/address/city plus the boundary polygon itself, which is lot size, not a building
  footprint), the utility's meter-survey shapefile (meter location/customer/size
  fields only), and the billing spreadsheet import (account/name/address/contact
  fields only) — none of them carry it. This is normally a separate "building" or
  "improvements" layer from a county assessor's GIS/CAMA system, distinct from the
  parcel-boundary layer already imported. Need that data source (a file Jared can get
  from the county) before `bldg_zone` will show anything but blank.
  1. 0 – 1,000
  2. 1,000 – 2,000
  3. 2,000 – 3,000
  4. 3,000 – 4,000
  5. 4,000 – 5,000
  6. 5,000 – 6,000
  7. 6,000 – 10,000
  8. 10,000+
- What would the **base rate** amount be.
- Conservation pricing idea: **penalize usage beyond what a lawn actually needs** —
  i.e., using lot-size zone (and, once available, building-size zone) per customer,
  charge more once consumption exceeds a reasonable-irrigation baseline for that zone.
- **Pelorus** manages the utility bill — explore whether something (a leak flag? a
  usage summary?) could be put directly on the bill via Pelorus. Needs a conversation
  with Pelorus about what's possible/integratable.
- **Cobblestone** (Cobblestone at Spring Creek, an HOA account already showing up as
  one of the higher continuous users in the data) — question: how much per unit are
  they billed.

## Data verification

- ~~Check whether the readings are actually hourly.~~ **Resolved 2026-09-11:**
  confirmed — spot-checked several meters and readings are genuinely hourly (24
  evenly-spaced readings/day) wherever data exists. The low overall average
  (~4-5 readings/meter/day across the full dataset) is because the historical
  backfill is still mid-progress, not a data quality issue: as of this check its
  cursor was at `2025-01-09` against a target range of `2024-08-22 → 2026-08-22`,
  so most of the 2-year range hasn't been backfilled yet. Coverage will keep filling
  in as the daily backfill timer continues (see `project-overview.md`).
- ~~Single low hourly readings can be a meter-reporting artifact, not a real dip.~~
  **Resolved 2026-09-12** — see the "Meter-reading artifact found + 3-hour rolling
  floor added" entry under Continuous Users tab above.
