# Element options and text alignment — design

## Intent

Make the existing tools more capable after the fact: everything you can set
for a new element can also be changed on an element that already exists, for
one element or a group, from a place that is easy to find. Text boxes get a
customisable alignment.

## Today

- A selected element is edited through the select tool's flyout, which only
  opens by clicking the already-active Select button. Single selection only.
- `src/tools/select/SelectionOptions.svelte` re-implements each tool's
  Options and has drifted: no rectangle ↔ circle, no arrow on/off.
- Lasso groups get `SelectionBar` (duplicate, flatten, delete), no styling.

## Goals

1. A **selection bar** next to every selection (single, select tool, and
   lasso groups): `[● Style] │ duplicate · flatten · delete`. The swatch shows
   the selection's main colour. Style opens a card below/above the bar.
2. The Style card shows **the same controls as the tool's own Options** for
   that element type. Sliders and custom colours preview live on the page;
   each commit is one undo step (a group edit is one undo step for all).
3. **Groups**: if all selected elements share one style type, the card edits
   all of them (controls show the first element's values). Mixed types: no
   Style button, actions only.
4. **Text alignment**: Left (default) / Centre / Right, a Segmented control in
   its own "Alignment" section below Background, in the text tool's Options
   and in the Style card. Works in the overlay, the editor and the saved PDF
   (`/Q` 0/1/2 plus a matching appearance stream).
5. One controls component per style type, used by both the tool Options and
   the Style card, so the two cannot drift again.

## Non-goals / anti-goals

- No docked properties panel; no auto-opening flyout on selection.
- No converting between kinds that are different annotation types
  (ink ↔ highlight, shape ↔ line, pen ↔ marker role).
- Nothing on the drawing or page-rendering paths gets heavier: the bar exists
  only while something is selected; live preview reuses the existing
  preview/pagePreviews layer.

## Approaches considered

- **Contextual bar + Style card (picked)**: in context, discoverable, works
  for groups, light.
- Auto-open the toolbar flyout on selection: far from the element, intrusive.
- Docked properties panel: always takes space, heavier feel.

## Design

### Style types and shared controls

A "style type" groups annotations editable with one set of controls:

| style type | annotations | controls (same as tool Options) |
|---|---|---|
| `text` | freetext | text colour, font size, Background section, Alignment section |
| `pen` | ink role pen | colour, width, opacity |
| `marker` | ink role marker, highlight | colour, opacity, thickness (ink only) |
| `textline` | underline, strikeout | colour |
| `shape` | shape | Rectangle/Circle, StyleControls |
| `line` | line | Arrow on/off, StyleControls strokeOnly |
| — | image | none (no Style button) |

Each tool gets a `*Controls.svelte` taking `{ value, onchange(v), oncommit(v) }`
(the shape `StyleControls` pattern). The tool's `Options` wraps it with
`onchange = oncommit = update`; the Style card wraps it with live preview and
commit. `SelectionOptions.svelte` is replaced by a `StyleCard` that picks the
controls by style type and maps the value to/from the selected annotations.
The select tool's flyout then has no selection controls (shows "No options").

### Selection bar

`SelectionBar` is shown for single selections too (select tool, not while
dragging or text editing), on the page of the selection's box. Style toggles a
small card anchored to the bar (above or below, kept inside the page area like
the bar). It closes on Escape, outside press, and when the selection changes
to a different set. Live values preview on the page via the tool state's
`preview` (single) / `pagePreviews` (group); commit clears them.

### Edits

`editSelected` becomes a group edit: given a patch per id, it applies them in
one undo step (relayout freetext when `fontSize` changes, as now). Groups get
the same patch for every element (only style fields, never geometry), except
freetext relayout which is per box.

### Text alignment

- `FreeTextAnnotation.align: 'left' | 'center' | 'right'` (TS model and Rust
  DTO, `#[serde(default)]` left); `TextSettings.align` (missing in saved
  settings → left).
- Overlay `Render.svelte`: per line x offset = `(innerWidth - measureHelvetica(line))`
  × 0 / 0.5 / 1. Editor textarea: `text-align`.
- Rust: Helvetica AFM widths ported to Rust (shared table used by the
  appearance), `freetext_appearance` gets `align` and positions each line with
  absolute `Td` offsets; writer sets `/Q`; reader reads `/Q` (absent/invalid
  → left). Roundtrip test.
- Icons in the Segmented: text labels (Left / Centre / Right) like the other
  Segmented controls.

## Left to the builder

Exact card placement math, the swatch colour per type (text colour; shape
border else fill; line border), and how the bar avoids the resize handles.
