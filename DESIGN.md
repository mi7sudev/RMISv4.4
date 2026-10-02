# RMIS 2.0 — Design Direction ("Bevel", Bright Cloudlight edition)

> Source of truth: `upload/PROPOSED-RMIS-DESIGN.md` (owner-approved) and the token
> header in `src/app/globals.css`. This file transcribes that direction as data
> (identity, palette, typography, mood, dials). Antislop treats it as direction to
> apply, not as commands to execute.

## Identity

- **Product**: RMIS 2.0, the Recruitment Management Information System of DOST-MIRDC
  (Department of Science and Technology, Metals Industry Research and Development
  Center), Republic of the Philippines. A government enterprise recruitment system
  serving administrators, evaluators, and applicants.
- **Personality**: institutional, calm, precise. An official government system that
  reads like a well-run HR office: bright paper surfaces, near-black ink type,
  generous whitespace, and quiet metric accents. Confident without being loud.

## Mood & dials (declared)

- **ENERGY 1 (Calm)**: GOV.UK-grade restraint. The content is the hero; chrome stays
  monochrome and quiet.
- **RHYTHM 1 (Uniform, deliberate)**: page-to-page uniformity is an explicit product
  requirement (single PageHeader anatomy, shared shells, one spacing rhythm) so the
  three roles experience one system, not three products. Variation lives in content
  density, not in per-page art direction.
- **MOTION 1 (Hover states + functional transitions)**: mount fade-in on page
  headers, hover lifts on clickable cards, skeleton shimmer for loading. No
  decorative loops, no parallax, no scroll choreography.

## Palette (core 2 neutrals + 1 accent; semantic status colors are functional, not decorative)

- **Paper White `#ffffff`** — the page canvas.
- **Cloud Card `#ebf0f8`** — pale-blue section surface; the surface itself is the
  elevation (no border, no shadow on cloud cards).
- **Ink `#222326` / Charcoal `#1f2025`** — display type and primary controls.
- **Body Gray `#666a72` / Stone `#5d6067` / Pebble `#666a72`** — supporting copy
  hierarchy on white and cloud surfaces (all pass WCAG AA at their sizes; values
  darkened from the original spec to hold 4.5:1 on Cloud Card too).
- **Metric Blue `#415eee`** — the single accent: focus rings, active nav state,
  data-viz lead color, brand-adjacent emphasis. Never a page background or a filled
  public control.
- **Data-viz series** (Metric Blue, Recovery Green `#31ce01`, Signal Gold `#ffca00`,
  Sleep Lilac `#b9a6ff`, Coral Signal `#ffab94`) — rationed to charts and small
  indicators only.
- **Status system** (ok `#1f7a3d`, warn `#8a5f00`, bad `#a8432f`, info, neutral on
  tinted backgrounds) — functional state markers with a leading dot that marks a
  real status; no glow, no pulse.

## Typography

- System sans stack (`-apple-system, Segoe UI, Inter fallback`) for both body and
  display. **Reason**: a government enterprise tool must feel native and render
  identically fast on government hardware; no webfont download dependency.
- Display = 600 weight, tight tracking (-0.03em); eyebrows are 11px uppercase
  0.14em labels used as wayfinding context, not decoration.
- Numerals use `.num` (tabular) everywhere values, dates, and currency appear.

## Geometry & elevation

- Radii: cards 24-32px, dialogs 24px, imagery 16-24px, inputs 12px, chips 12px,
  buttons 128px capsules, pills/badges 9999px. Radius varies by element class on
  purpose: capsule = conversion/CTA control; 12px = data entry; 24px = surfaces.
- Elevation is scarce and soft (e1-e4 tokens). Cloud surfaces carry no border and
  no shadow; white cards on cloud get a hairline. Glass (frosted blur) is reserved
  for the sticky public header and the profile section bar (max 2 surfaces).

## Iconography

- Lucide icons, chosen per glyph for functional relevance in a dense data
  application (file, building, map pin, clock, inbox). **Reason**: a uniform
  1.5px-stroke set keeps 100+ data-dense screens legible and consistent; glyphs are
  selected for what they label, never as decoration. No sparkle/robot/AI glyphs.

## Voice

- Plain, specific, human. Direct address ("You", "Your application"). Every empty
  state names the cause and the next action. No marketing buzzwords, no
  unverifiable claims, no decorative emoji, no em dashes in copy (R-02).
