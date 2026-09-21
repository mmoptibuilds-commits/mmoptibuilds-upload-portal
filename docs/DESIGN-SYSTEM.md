# Design system

The portal uses the **Signal Room** visual language: a private, high-trust transfer workspace with technical typography, clear state, and enough atmosphere to feel intentional without competing with upload controls.

## Core idea

This is an operational tool, not a public marketing page. Every surface should help a client answer three questions quickly:

1. What account am I using?
2. What is the transfer doing right now?
3. What action is safe to take next?

The visual system is deliberately dark, structured, and legible. Decorative backgrounds are route-level atmosphere only; they never carry status information and never sit above interactive content.

## Palette

- Environment: deep navy ink (`#06111b`) with restrained grid texture.
- Surfaces: blue-black panels (`#0c1b2a`, `#102538`) with cool borders.
- Text: high-contrast cool white (`#f4f7fb`) and muted blue-grey for secondary copy.
- Primary action: bright cyan (`#6de3e6`) with dark readable foreground.
- Focus and caution: warm amber (`#f3be6b`) so keyboard focus and warnings remain visible against cyan surfaces.
- State: green for confirmed/ready, orange for paused/pending, red for failed.

## Typography

- Display and interface text: Space Grotesk loaded through `next/font/google` with `display: swap`.
- Operational labels and values: DM Mono loaded through the same build-time font pipeline.
- Font files are not fetched by a runtime CSS `@import`; production builds own the font request and can cache it predictably.

## Surfaces and components

- Cards use a solid/translucent navy gradient, a visible border, and a restrained shadow. Blur is reserved for the login card, shell rail, and modal backdrop.
- Buttons keep a minimum 44px interaction height. Primary actions have one clear verb; secondary actions never compete with them.
- Status is always communicated with text plus a color/state marker. Color alone is never the only signal.
- Tables include captions and become labeled cards below the mobile breakpoint instead of forcing a tiny horizontally-scrolling ledger.
- Empty, loading, error, disabled, offline, paused, retry, and completion states are explicit UI states, not silent layout changes.
- Icons are local SVG paths from the shared icon map; emoji are not used as controls or status indicators.

## Route identity

- Login: Beams atmosphere behind a focused access card.
- Upload: Beams atmosphere behind the intake workspace and resumable queue.
- History: Aurora atmosphere behind read-only receipt cards.
- Admin: restrained shell background for data-dense operations.

The `CustodyStrip` labels are decorative and must remain `aria-hidden`; semantic headings and status text carry the actual meaning.

## Background effects

The Beams component is adapted from Kokonut UI and the Aurora component from Aceternity UI. They are local, reviewable components with their source URLs in code comments.

- Effects are behind content, `aria-hidden`, and non-interactive.
- `prefers-reduced-motion` renders a static frame.
- Beams use fewer beams on small/low-core devices, stop their animation when the document is hidden, cap blur, and use a capped device-pixel ratio.
- Effects are allowed to fail visually without blocking authentication, uploads, or navigation.

## Accessibility and responsiveness

Keep semantic landmarks, visible focus rings, labels, `aria-live` status messages, progress roles, and keyboard-accessible controls. Modal actions must be explicit and destructive changes must use an in-app confirmation surface. At narrow widths, navigation scrolls horizontally, controls remain touch-sized, and data tables become labeled cards.
