# Cross-page Element Drag Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dragging an image, text box, ink or shape with the Select tool carries it across page edges onto neighbouring pages, with auto-scroll.

**Architecture:** A pure screen-space function decides where the dragged element lands (current page, cut off, or snapped to a neighbour). Mounted overlays register their page's viewport and client origin in the session tool state so the Select tool can map the pointer onto any visible page. While a cross-page drag runs, the viewer keeps the press page mounted and auto-scrolls near the window edges; the press page's overlay re-sends the last pointer position after each scroll.

**Tech Stack:** Svelte 5 runes, TypeScript, Vitest + @testing-library/svelte, pdf.js viewports.

**Spec:** `docs/superpowers/specs/2026-11-19-cross-page-element-drag-design.md`

## Global Constraints

- Snap threshold: strictly more than half of the element's screen height past the top/bottom page edge.
- Snap target: flush with the next page's top edge (dragging down) / the previous page's bottom edge (dragging up); chains across pages.
- First/last page: at most half of the element's height out.
- Horizontal moves keep today's `clampShift` behaviour (never push further off the page).
- Release keeps the cut-off position; one `updateAnnotation` per drag (page change included).
- Highlights keep today's fully-clamped single-page move.
- Commits: user's git identity only, no Claude co-author trailer (user memory).

## Review Focus

- Element taller than half the page: snapping must not loop (a snap must never immediately trigger the reverse snap) — Task 1 test `does not ping-pong`.
- Neighbour page not mounted (scrolled far, virtualised): no snap, behaves like a document end — Task 1 test `missing neighbour clamps at half`.
- Pages of different widths: x is clamped onto the narrower page — Task 1 test `clamps x onto a narrower page`.
- Drag cancelled (Esc/lost capture) after a snap: original page and position restored, auto-scroll and page pin cleared — Task 3 test `cancel after a snap restores`.
- Tool switch or tab close mid-drag: `crossDrag` state cleared by ToolRouter.deactivate — Task 2 test.

---

### Task 1: Cross-page placement math

**Files:**
- Create: `src/tools/select/crossPage.ts`
- Test: `tests/tools/select/crossPage.test.ts`

**Interfaces:**
- Produces:
  ```ts
  /** A mounted page: its viewport and its top-left corner in client px. */
  export interface PageFrame { vp: PageViewport; origin: Point }
  /** Drag state: the element as placed on `base.page` when the pointer was at `anchor` (client px). */
  export interface CrossPageDrag { base: Annotation; anchor: Point }
  /** Where the element goes for the pointer at `client`; returns the (possibly re-based) drag. */
  export function dragAcrossPages(drag: CrossPageDrag, client: Point, frameOf: (page: number) => PageFrame | null): { annotation: Annotation; drag: CrossPageDrag }
  ```
- Algorithm: on page `p = drag.base.page` with frame `f`, box = `toScreenRect(bounds(base), f.vp)`; screen delta `d = client - anchor`; dx via `clampShift` in screen space against `[0, vp.width]`; dy unclamped. Overflow below = `box.bottom + dy - vp.height`, above = `-(box.top + dy)`. If overflow below > h/2 and `frameOf(p+1)` exists: place the element on p+1 with screen top 0 and the same screen x relative to its page (clamped to the new width), re-base (`base` = that placement, `anchor` = `client`) and loop (max `pageCount` iterations, i.e. stop when the neighbour is null). Symmetric upwards (bottom = previous page's `vp.height`). Without a neighbour clamp dy so overflow ≤ h/2. Placement on page q = `translate` of the annotation by the PDF delta between its current screen rect under `frameOf(q).vp` and the wanted rect, with `page: q`.

- [ ] **Step 1: Write failing tests** with two/three fake 200×100pt pages at scale 2 (screen 400×200, origins `[0,0]`, `[0,216]`, `[0,432]`) and a 20×20pt image:
  - `moves within the page and cuts off the overflow`: image at y 10..30 pt dragged 30px down → stays page 0, bounds bottom at pdf y < 0 (partly cut off).
  - `snaps to the top of the next page once more than half is out`: drag down until 21px of its 40px screen height overflow → `annotation.page === 1`, its screen top on page 1 is 0; `drag.anchor` equals the client point.
  - `exactly half out does not snap` (20px overflow → page 0).
  - `follows the pointer after the snap` (further 10px down from the re-based drag → screen top 10 on page 1).
  - `snaps up to the bottom of the previous page` (mirror).
  - `chains across pages` (one call with a client point two pages down → page 2).
  - `missing neighbour clamps at half` (page 0 dragged up 200px → overflow above exactly 20px, page 0).
  - `clamps x onto a narrower page` (page 1 is 100pt wide; image at x 180..200pt snaps with x ≤ 100pt).
  - `does not ping-pong` with an element 60pt tall on 100pt pages: after a down snap, the result at the same client point is still page 1.

- [ ] **Step 2: Run** `npx vitest run tests/tools/select/crossPage.test.ts` → FAIL (module missing).
- [ ] **Step 3: Implement** `dragAcrossPages` and export `clampShift` from `src/tools/select/index.ts` into `crossPage.ts` (move it; index imports it back).
- [ ] **Step 4: Run** the same command → PASS.
- [ ] **Step 5: Commit** `feat: cross-page drag placement math`.

### Task 2: Page frames and cross-drag state in the tool context

**Files:**
- Modify: `src/core/session/toolState.svelte.ts`, `src/core/registry/tools.ts`, `src/core/viewer/toolRouting.svelte.ts`, `src/core/viewer/Overlay.svelte`, `src/core/viewer/Viewer.svelte`
- Test: `tests/core/viewer/toolRouting.test.ts`, `tests/core/viewer/OverlayPointer.test.ts`, `tests/core/viewer/Viewer.test.ts`

**Interfaces:**
- Produces:
  - `SessionToolState.frames: Map<number, () => PageFrame | null>` (plain Map, not reactive) and `crossDrag = $state.raw<{ page: number } | null>(null)`.
  - `ToolContext.pages?: { frame(page: number): PageFrame | null }` and `ToolContext.crossDrag?: { set(d: { page: number } | null): void }` (optional so test stand-ins keep working).
  - Overlay prop `frames?: Map<number, () => PageFrame | null>`: registers `pageNumber - 1 → () => vp && { vp, origin: [rect.left, rect.top] }` in an effect, unregisters on cleanup (only if still its own entry).
  - Viewer prop `crossDrag?: { page: number } | null`: the rendered page list is `range ∪ {crossDrag.page}`; passes `frames` to each Overlay. App passes `stateOf(session).crossDrag` / `.frames` the same way it passes `toolPreview`.
  - `ToolRouter.deactivate` resets `crossDrag = null`.

- [ ] **Step 1: Failing tests:** router context `pages.frame(i)` returns the registered frame; `crossDrag.set` writes state; deactivate clears it. Overlay registers a frame with `origin [10, 20]` for page index 2 and removes it on unmount. Viewer renders the pinned page outside the visible range when `crossDrag = { page: 40 }`.
- [ ] **Step 2: Run** `npx vitest run tests/core/viewer` → new tests FAIL.
- [ ] **Step 3: Implement** the interfaces above.
- [ ] **Step 4: Run** `npx vitest run tests/core/viewer` → PASS.
- [ ] **Step 5: Commit** `feat: expose page frames and cross-page drag state to tools`.

### Task 3: Select tool moves across pages

**Files:**
- Modify: `src/tools/select/index.ts`
- Test: `tests/tools/select/select.test.ts`

**Interfaces:**
- Consumes: `dragAcrossPages`, `PageFrame`, `CrossPageDrag` (Task 1); `ctx.pages`, `ctx.crossDrag` (Task 2).
- `Press` gains `cross: CrossPageDrag | null`. On the first move of a non-handle press on a non-highlight: `cross = { base: target, anchor: client }`, `ctx.crossDrag?.set({ page: e.page })`. `client = [e.native.clientX, e.native.clientY]`; `frameOf(i) = i === e.page ? { vp: e.vp, origin: client − e.screen } : ctx.pages?.frame(i) ?? null`. Each move: `{annotation, drag} = dragAcrossPages(...)`, store `drag`, preview `{...annotation, modifiedAt}`. `end()` also calls `ctx.crossDrag?.set(null)`. Highlights keep the old `moved()`.

- [ ] **Step 1: Failing tests** (extend `ev()` to fill `native.clientX/Y` and `screen` from the vp; add an optional `pages` to `setup`): drag an image down past half onto page 1 → committed `page === 1`, one undo restores page 0 and the rect; `cancel after a snap restores` (store unchanged, `crossDrag` null); `crossDrag` set to `{ page: 0 }` during the drag and null after up; a highlight stays clamped on its page. Update `moves ink and keeps it on the page`: vertical now stops at half out (x clamp unchanged).
- [ ] **Step 2: Run** `npx vitest run tests/tools/select` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run tests/tools/select` → PASS.
- [ ] **Step 5: Commit** `feat: drag elements between pages`.

### Task 4: Auto-scroll during a cross-page drag

**Files:**
- Create: `src/core/viewer/autoScroll.ts`
- Modify: `src/core/viewer/Viewer.svelte`, `src/core/viewer/Overlay.svelte`
- Test: `tests/core/viewer/autoScroll.test.ts`, `tests/core/viewer/OverlayPointer.test.ts`

**Interfaces:**
- Produces: `export function autoScrollSpeed(pointerY: number, top: number, bottom: number): number` — px per frame; 0 outside a 48px edge band, growing linearly to 24px at (and beyond) the edge; negative at the top.
- Viewer: while `crossDrag` is set, a window `pointermove` listener records clientY; a `requestAnimationFrame` loop scrolls `el.scrollTop += autoScrollSpeed(y, rect.top, rect.bottom)`; stops when `crossDrag` clears.
- Overlay: during a gesture, a capture-phase `scroll` listener on `window` re-sends `onPointerMove(toPageEvent(lastNative, vp))` (store the last native PointerEvent in `gesture`) when the prop `rescrollMoves` (Viewer passes `!!crossDrag`) is true.

- [ ] **Step 1: Failing tests:** `autoScrollSpeed(500, 0, 600)` = 0; at 600 → 24; at 0 → −24; at 576 → 12. Overlay with `rescrollMoves` re-sends a move with recomputed coordinates after a scroll event when the svg rect moved up 50px; without it, no move.
- [ ] **Step 2: Run** `npx vitest run tests/core/viewer` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test` and `npm run check` → all PASS, no type errors.
- [ ] **Step 5: Commit** `feat: auto-scroll while dragging an element across pages`.

### Task 5: Check in the running app

- [ ] Run the app in the browser pane (`npm run dev`), open a multi-page PDF, insert an image, drag it down over the bottom edge: cut off, then snaps to page 2 at >half; keep dragging to page 3 with auto-scroll; drag back up; undo returns it; save and reopen keeps it on the new page.
