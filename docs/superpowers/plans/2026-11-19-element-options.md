# Element Options and Text Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every option of a tool can be changed on existing elements (one or a group) from a bar next to the selection; text boxes get Left/Centre/Right alignment.

**Architecture:** One `*Controls.svelte` per style type, shared by the tool's Options and a `StyleCard` opened from `SelectionBar`. A pure `styleTypes.ts` maps annotations ⇄ control values. Group edits commit as one undo step. Alignment is a new `align` field end to end, saved as `/Q` with a Helvetica-metric appearance.

**Tech Stack:** Svelte 5, TypeScript, vitest, Rust (lopdf), cargo test.

**Spec:** `docs/superpowers/specs/2026-11-19-element-options-design.md`

## Global Constraints

- `align: 'left' | 'center' | 'right'`, default `'left'`; `/Q` 0 / 1 / 2.
- Alignment section title "Alignment", below the Background section; Segmented labels "Left", "Centre", "Right".
- Nothing new on the drawing / page-rendering paths; the bar exists only while something is selected.
- Conventional commits, no Claude attribution trailer; every task ships tests.

## Review Focus

- Saved settings from before this change have no `align`: the tool must behave as left (test in Task 2).
- A PDF from another app with `/Q 2` opens right-aligned; invalid `/Q` reads as left (test in Task 1).
- A group of text boxes changing font size: each box relaid out with its own page rotation, one undo step (Task 4).
- Selecting a different element while the Style card is open must not apply a pending live value to the new one (Task 5).
- Lines with trailing spaces at wraps: centre/right offsets use the trimmed line as wrapped, same on screen and in the PDF (Tasks 1–2).

---

### Task 1: Alignment in the Rust PDF layer

**Files:** Modify `src-tauri/src/pdf/dto.rs`, `appearance.rs`, `writer.rs`, `reader.rs`, `winansi.rs` (widths); Test `src-tauri/tests/roundtrip.rs`, unit tests in `appearance.rs`.

**Interfaces — Produces:** `AnnotationDto::Freetext { …, align: TextAlign }` with `#[serde(default)] enum TextAlign { #[default] Left, Center, Right }` (serde lowercase); `pub fn helvetica_width(s: &str, size: f64) -> f64`; `freetext_appearance(rect, lines, font_size, text_color, background, align, page_rotation)`.

- [ ] Tests: `helvetica_width("Hi", 10.0) == 9.44` (722+222); `freetext_appearance` with `Center` writes each line at `x1 + TEXT_PADDING + (inner - w)/2` (absolute `Tm` per line); roundtrip test `freetext_alignment_roundtrips` saves center and right boxes and reads them back; reader test: `/Q 7` → Left.
- [ ] Run `cargo test` → new tests fail.
- [ ] Implement: same AFM table as `textLayout.ts` (WinAnsi specials included, unknown 556); each line positioned with `1 0 0 1 x y Tm`; writer adds `"Q" => 0|1|2`; reader maps `/Q` integer.
- [ ] `cargo test` and `cargo clippy --all-targets` pass. Commit `feat: text box alignment in saved PDFs`.

### Task 2: Alignment in the TS model, overlay, editor and text tool

**Files:** Modify `src/core/session/model.ts`, `src/annotations/freetext/Render.svelte`, `Editor.svelte`, `src/tools/text/settings.ts`, `index.ts`; Test `tests/annotations/freetext.test.ts`, `tests/tools/text/*.test.ts`.

**Interfaces — Produces:** `FreeTextAnnotation.align: TextAlign`, `export type TextAlign = 'left' | 'center' | 'right'`; `lineX(line: string, fontSize: number, innerWidth: number, align: TextAlign): number` (pt offset from the inner left edge) in `src/core/geometry/textLayout.ts`; `TextSettings.align?: TextAlign`.

- [ ] Tests: `lineX('Hi', 10, 20, 'center') === (20 - 9.44)/2`, `'right'` → `20 - 9.44`, `'left'` → 0; new box from settings without `align` gets `'left'`, with `'right'` gets `'right'`.
- [ ] Implement; Render uses `lineX`; editor textarea gets `text-align`.
- [ ] `npx vitest run`, `npm run check` pass. Commit with Task 3.

### Task 3: Shared controls and style types

**Files:** Create `src/tools/text/TextControls.svelte`, `src/tools/pen/PenControls.svelte`, `src/tools/marker/MarkerControls.svelte`, `src/tools/shape/ShapeControls.svelte` (shape kind + StyleControls), `src/tools/shape/LineControls.svelte` (arrow + strokeOnly), `src/tools/select/styleTypes.ts`; Modify each tool's `Options.svelte` to wrap its controls; Test `tests/tools/select/styleTypes.test.ts`.

**Interfaces — Produces:** each controls component takes `{ value: V; onchange(v: V): void; oncommit(v: V): void }`. `styleTypes.ts`:
- `type StyleType = 'text' | 'pen' | 'marker' | 'textline' | 'shape' | 'line'`
- `styleTypeOf(list: readonly Annotation[]): StyleType | null` (null: empty, image, or mixed)
- `styleValue(a: Annotation): StyleValue` and `applyStyle(a: Annotation, v: StyleValue): Annotation` (style fields only, never geometry)
- `swatchColor(a: Annotation): RGB | null`

- [ ] Tests: ink pen + ink pen → `'pen'`; highlight + marker ink → `'marker'`; underline + strikeout → `'textline'`; freetext + shape → null; image → null; `applyStyle(shape, {shape:'circle',…})` keeps `rect`; `applyStyle(line, {arrow:true,…})` keeps `points`; `applyStyle(highlight, markerValue)` ignores width; `applyStyle(freetext, {align:'right'})` keeps text.
- [ ] Implement; tool Options behave as before (Toolbar tests stay green). TextControls adds the Alignment section after Background.
- [ ] `npx vitest run`, `npm run check`. Commit `feat: text box alignment, shared tool controls`.

### Task 4: Group edit command

**Files:** Modify `src/tools/select/commands.ts`; Test `tests/tools/select/commands.test.ts` (or existing select tests).

**Interfaces — Produces:** `editAnnotations(session: DocumentSession, afters: readonly Annotation[]): Promise<void>` — one undo step for all changed ones, per-field patch as `editSelected` does today, freetext relaid out when `fontSize` changed (each with its page rotation). `editSelected(s, a)` becomes `editAnnotations(s, [a])`.

- [ ] Tests: two boxes font size 12 → 20 in one call: both relaid out, one `undo` restores both; unchanged list → no history entry.
- [ ] Implement with a composite command (see `history.svelte.ts`). Commit `feat: edit several elements in one undo step`.

### Task 5: Selection bar with Style card

**Files:** Modify `src/core/viewer/SelectionBar.svelte`, `Overlay.svelte`, `src/App.svelte`, `src/toolbar/Toolbar.svelte`, `src/tools/select/index.ts`; Create `src/tools/select/StyleCard.svelte`; Delete `src/tools/select/SelectionOptions.svelte`; Remove `SelectionOptions` from `ToolDefinition`; Test `tests/core/viewer/OverlaySelection.test.ts`, `OverlayGroup.test.ts`.

**Interfaces — Consumes:** Task 3 `styleTypeOf/styleValue/applyStyle/swatchColor`, Task 4 `editAnnotations`.

- [ ] Tests: single select shows the bar with a Style button; image selection shows no Style button; mixed lasso group shows no Style button; clicking Style opens the card with the type's controls; committing a colour changes all selected and is one undo step; no bar while dragging or text editing.
- [ ] Implement: bar shown for single selections (not during gestures/textEdit); Style toggles the card (dismissable, closes when the selection set changes); live values go to `preview` (single) / `pagePreviews` (group) and clear on commit or close.
- [ ] `npx vitest run`, `npm run check`, `cargo test`. Commit `feat: style existing elements from the selection bar`.
- [ ] Verify in `npm.cmd run tauri dev`: select a text box → Style → change colour/size/alignment; lasso pen strokes → change width; save, reopen.
