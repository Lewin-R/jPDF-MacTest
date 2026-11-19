# JuliePDF MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build JuliePDF, a fast, lightweight Windows PDF annotator (tabs, free scroll/zoom, right toolbar with "+" picker, marker/pen/text/select/hand/eraser tools, undo/redo, fullscreen) that saves annotations into the PDF as standard annotations.

**Architecture:** Tauri 2 app. Svelte 5 + TypeScript frontend renders pages with pdf.js (worker) in a virtualized continuous-scroll viewer and draws JuliePDF-managed annotations in an SVG overlay per page. Tools, annotation kinds, commands and keybindings plug in through registries. A Rust core (lopdf) reads annotations on open and writes them on save as an incremental update with appearance streams.

**Tech Stack:** Tauri 2, Rust (stable, MSVC), lopdf, serde, tempfile, tauri-plugin-dialog, tauri-plugin-single-instance; Svelte 5 (runes), TypeScript, Vite, pdfjs-dist, lucide-svelte; Vitest; cargo test.

**Spec:** `docs/superpowers/specs/2026-11-18-juliepdf-design.md` — read it alongside this plan.

## Global Constraints

- Platform: Windows 11 only; WebView2. No runtime network access — all fonts, icons, pdf.js worker bundled.
- Dependency versions: latest stable at scaffold time, **pinned exactly** (no `^`/`~` in `package.json`; `Cargo.lock` committed).
- No UI component library; widgets are hand-built Svelte components. Icons: `lucide-svelte` only.
- All colours come from CSS variables in `src/theme/tokens.css`; components never hard-code colours (annotation colours excepted).
- Theme tokens (exact): `--bg #0F111A`, `--bg-deep #090B10`, `--surface #1A1C25`, `--surface-hover #1F2233`, `--border #1F2233`, `--text #8F93A2`, `--text-strong #EEFFFF`, `--text-muted #4B526D`, `--accent #FFC107`, `--accent-soft rgba(255,193,7,0.15)`, `--danger #FF5370`, `--success #C3E88D`.
- UI font: `"Segoe UI Variable Text", "Segoe UI", sans-serif`, 13px base; logo font `"Segoe UI Variable Display"` semibold.
- Sizes: title bar 40px, tool strip 52px wide, status bar 32px, page gap 16px, radii 6–8px, transitions 120–150ms ease-out, honour `prefers-reduced-motion`.
- Name "JuliePDF"; wordmark "jPDF" (j = `--accent`, PDF = `--text-strong`); window title `<file name> — JuliePDF`.
- Annotation geometry is always PDF user space (points); screen ↔ PDF via pdf.js `PageViewport.convertToPdfPoint` / `convertToViewportPoint`.
- Saved annotations: standard `/Highlight`, `/Ink`, `/FreeText` with `/AP /N`, `/NM` (id), `/M`, `/T` (author, default "JuliePDF"), `/F 4`, private `/JuliePDF << /v 1 … >>`. Incremental update only; original bytes stay an unchanged prefix.
- Zoom range 0.1–8.0; default fit width.
- Performance budget (spec §8): installer < 15 MB; window < 1 s; first page of 50-page PDF < 300 ms; 60 fps scroll; save < 200 ms typical; idle RAM < 200 MB.
- Commits use the user's git identity only; no Co-Authored-By or other Claude attribution in commit messages.

## Review Focus

1. **Rotated / offset pages** (`/Rotate 90`, CropBox not at 0,0): annotations must land exactly where drawn, in JuliePDF and in other viewers. → tests in Task 7 (transform) and Task 20 (FreeText `/Matrix` on rotated page).
2. **Edit after save, then save again**: the edited annotation is replaced (same object number), no duplicates; deleted ones disappear. → test in Task 16.
3. **Text outside WinAnsi** (ä ö ü ß must survive; emoji/CJK become `?`, no crash). → test in Task 20.
4. **PDFs that already contain annotations from Drawboard/Acrobat** (no `/JuliePDF` key, possibly no `/AP`): loaded as editable, never drawn twice, unknown types preserved byte-for-byte. → tests in Task 16 and Task 17.
5. **Saving while the file is locked/read-only** (open in another app): save fails with a clear error, original file intact, Save As offered. → test in Task 16, UI in Task 17.

---

## File Structure

```
package.json, vite.config.ts, tsconfig.json, vitest.config.ts, index.html
src/
  main.ts                              mounts App
  App.svelte                           layout: TitleBar / Viewer|EmptyState / Toolbar / StatusBar / modals
  theme/tokens.css, base.css
  app/
    TitleBar.svelte, Tabs.svelte, WindowControls.svelte, Logo.svelte
    StatusBar.svelte, EmptyState.svelte
    fullscreen.svelte.ts               fullscreen state + toggle
    fileOpening.ts                     dialog / drag-drop / launch args / single-instance → openFile()
    tabs.svelte.ts                     TabsStore: sessions[], activeId
  core/
    registry/commands.ts               CommandRegistry
    registry/keybindings.ts            KeybindingRegistry
    registry/tools.ts                  ToolRegistry + ToolDefinition types
    registry/annotationKinds.ts        AnnotationKindRegistry
    session/model.ts                   annotation types (= DTO shape)
    session/store.svelte.ts            AnnotationStore
    session/history.ts                 History + Command
    session/commands.ts                AddAnnotations / UpdateAnnotation / DeleteAnnotations
    session/session.svelte.ts          DocumentSession
    viewer/pdfEngine.ts                pdf.js wrapper
    viewer/layout.ts                   pure layout/zoom math
    viewer/Viewer.svelte               scroll container, virtualization, zoom input
    viewer/PageView.svelte             canvas + text layer + overlay for one page
    viewer/Overlay.svelte              SVG annotations + pointer routing to active tool
    viewer/renderCache.ts              LRU of rendered page bitmaps
    geometry/stroke.ts                 simplify + smoothing path
    geometry/hit.ts                    hit tests
    geometry/quads.ts                  rects → highlight quads
    geometry/textLayout.ts             FreeText line wrapping
    ipc/api.ts                         typed Tauri invoke wrappers
    settings/settings.svelte.ts        persisted settings + toolbar instances
  annotations/ink/, highlight/, freetext/   index.ts (kind def) + Render.svelte
  tools/select/, hand/, marker/, pen/, text/, eraser/   index.ts + Options.svelte + Icon.svelte
  tools/index.ts                       registers all built-in tools
  ui/ColorPicker.svelte, Slider.svelte, Segmented.svelte, Flyout.svelte, Modal.svelte, Toast.svelte, toasts.svelte.ts, ContextMenu.svelte
  toolbar/Toolbar.svelte, ToolPicker.svelte
tests/ (Vitest, mirrors src/ paths: tests/core/viewer/layout.test.ts, …)
src-tauri/
  Cargo.toml, tauri.conf.json, capabilities/default.json, icons/
  src/main.rs, lib.rs                  builder, plugins, command registration
  src/error.rs                         AppError
  src/commands/files.rs                open_pdf, read_annotations, save_pdf, get_launch_files
  src/commands/settings.rs             load_settings, save_settings
  src/pdf/dto.rs                       AnnotationDto
  src/pdf/appearance.rs                AP content generation
  src/pdf/winansi.rs                   text encoding
  src/pdf/writer.rs                    write_incremental
  src/pdf/reader.rs                    read_annotations
  tests/roundtrip.rs, tests/fixtures.rs (fixture PDFs built in code with lopdf)
```

## Shared Types (defined in Task 9 / Task 15, used everywhere)

```ts
// src/core/session/model.ts — identical JSON shape to Rust AnnotationDto
export type RGB = [number, number, number];           // 0..1
export type Point = [number, number];                 // PDF user space
export type Rect = [number, number, number, number];  // x1, y1, x2, y2 (PDF, y up)
export type Quad = [number, number, number, number, number, number, number, number]; // PDF QuadPoints order: TL, TR, BL, BR

interface Base { id: string; page: number; sourceRef: string | null; modifiedAt: string; author: string }
export interface HighlightAnnotation extends Base { kind: 'highlight'; quads: Quad[]; color: RGB; opacity: number }
export interface InkAnnotation extends Base { kind: 'ink'; strokes: Point[][]; color: RGB; width: number; opacity: number; blend: 'normal' | 'multiply'; role: 'pen' | 'marker' }
export interface FreeTextAnnotation extends Base { kind: 'freetext'; rect: Rect; text: string; lines: string[]; fontSize: number; textColor: RGB; background: { color: RGB; opacity: number } | null }
export type Annotation = HighlightAnnotation | InkAnnotation | FreeTextAnnotation;
```

`sourceRef` uses pdf.js annotation id format: `"12R"` (gen 0) or `"12R3"` (gen 3). `null` = never saved.

---

## Phase M0–M1: Scaffold, shell, theme

### Task 1: Scaffold project and tooling

**Files:**
- Create: whole scaffold via `npm create tauri-app@latest` (template `svelte-ts`, package manager npm, identifier `app.juliepdf`), `vitest.config.ts`, `tests/smoke.test.ts`, `.gitignore`, `.editorconfig`, `.prettierrc`

**Interfaces:**
- Produces: `npm run tauri dev`, `npm test` (vitest run), `cargo test` in `src-tauri/`.

- [ ] **Step 1:** Verify prerequisites: `rustc --version`, `cargo --version`, `node --version` (LTS), `npm --version`. Expected: all print versions. If missing, install per spec §3 "Machine prerequisites" and stop until done.
- [ ] **Step 2:** `git init` in `C:\Users\manys\projects\juliepdf`, then scaffold into the existing folder (keep `docs/`). Pin all versions exactly in `package.json` (remove `^`).
- [ ] **Step 3:** Add Vitest + `@testing-library/svelte` + `jsdom`; script `"test": "vitest run"`. Write `tests/smoke.test.ts`: `expect(1 + 1).toBe(2)`.
- [ ] **Step 4:** Run `npm test` → PASS; `cd src-tauri && cargo test` → PASS (0 tests); `npm run tauri dev` → a window opens.
- [ ] **Step 5:** In `tauri.conf.json`: `productName` "JuliePDF", window `title` "JuliePDF", `decorations: false`, `width 1280`, `height 800`, `minWidth 640`, `minHeight 400`, background colour `#0F111A` (avoids white flash).
- [ ] **Step 6:** Commit `chore: scaffold Tauri 2 + Svelte 5 + TS project`.

### Task 2: Theme, base styles, logo

**Files:**
- Create: `src/theme/tokens.css`, `src/theme/base.css`, `src/app/Logo.svelte`, `tests/app/Logo.test.ts`
- Modify: `src/main.ts` (import CSS), `src/App.svelte` (clear template)

**Interfaces:**
- Produces: CSS variables per Global Constraints; `<Logo size?: 'sm' | 'lg' />`.

- [ ] **Step 1: Failing test** `Logo renders j in accent span and PDF in strong span`: render `<Logo/>`; `expect(getByText('j').className).toContain('logo-j')`; `expect(getByText('PDF').className).toContain('logo-pdf')`.
- [ ] **Step 2:** `npm test` → FAIL (module not found).
- [ ] **Step 3:** Implement tokens.css (exact values), base.css (body `background: var(--bg)`, `color: var(--text)`, font, `user-select: none` on chrome, thin dark scrollbars styled with `--surface-hover`, focus ring `2px solid var(--accent)`), Logo (`sm` 16px for title bar, `lg` 56px for empty state; letter-spacing -0.02em).
- [ ] **Step 4:** `npm test` → PASS. `npm run tauri dev` → dark window.
- [ ] **Step 5:** Commit `feat: theme tokens, base styles, jPDF logo`.

### Task 3: Window chrome and layout

**Files:**
- Create: `src/app/TitleBar.svelte`, `src/app/WindowControls.svelte`, `src/app/Tabs.svelte`, `src/app/StatusBar.svelte`, `src/app/EmptyState.svelte`
- Modify: `src/App.svelte`, `src-tauri/capabilities/default.json`

**Interfaces:**
- Consumes: `Logo`.
- Produces: `App.svelte` grid layout with slots for viewer and toolbar; `EmptyState` emits `onOpen()`.

- [ ] **Step 1:** Layout in App: CSS grid rows `40px 1fr 32px`, columns `1fr 52px`. Title bar spans both columns; toolbar column placeholder.
- [ ] **Step 2:** TitleBar: Logo left (12px padding), Tabs (placeholder, wired in Task 6), `data-tauri-drag-region` on empty area, WindowControls right (minimize, maximize/restore toggle, close; close hover `--danger`). Use `getCurrentWindow()` from `@tauri-apps/api/window`; add `core:window:allow-minimize`, `allow-toggle-maximize`, `allow-close`, `allow-start-dragging`, `allow-set-fullscreen` permissions. Double-click drag region toggles maximize.
- [ ] **Step 3:** EmptyState: centred `Logo lg`, primary button "Open PDF" (`--accent` background, `--bg` text), hint "or drop a file here · Ctrl+O" in `--text-muted`.
- [ ] **Step 4:** StatusBar skeleton: left undo/redo icon buttons, centre page nav placeholder, right zoom placeholder + fullscreen button (lucide `Maximize`), all disabled when no document.
- [ ] **Step 5:** Manual check `npm run tauri dev`: drag window by title bar, all three window buttons work, maximize via double-click.
- [ ] **Step 6:** Commit `feat: custom title bar, window controls, status bar, empty state`.

### Task 4: Command and keybinding registries

**Files:**
- Create: `src/core/registry/commands.ts`, `src/core/registry/keybindings.ts`, `tests/core/registry/commands.test.ts`, `tests/core/registry/keybindings.test.ts`

**Interfaces:**
- Produces:
```ts
export interface CommandDef { id: string; title: string; run(): void | Promise<void>; enabled?(): boolean }
export class CommandRegistry { register(def: CommandDef): () => void; execute(id: string): Promise<boolean>; has(id: string): boolean }
export const commands: CommandRegistry;
export class KeybindingRegistry {
  constructor(cmds: CommandRegistry);
  bind(chord: string, commandId: string): () => void;  // chord like "Ctrl+Shift+S", "F11", "Delete", "Space"
  handle(e: KeyboardEvent): boolean;                     // true if handled (caller preventDefaults)
}
export const keybindings: KeybindingRegistry;
export function chordFromEvent(e: KeyboardEvent): string; // normalised: Ctrl+Alt+Shift+Key order, letters upper-case
```

- [ ] **Step 1: Failing tests:**
  - `execute runs registered command and returns true`; `execute returns false for unknown id`; `execute returns false and does not run when enabled() is false`; `register returns disposer that unregisters`.
  - `chordFromEvent({ctrlKey:true, shiftKey:true, key:'s'}) === 'Ctrl+Shift+S'`; `chordFromEvent({key:'F11'}) === 'F11'`; `handle executes bound command and returns true`; `handle ignores letter shortcuts without modifiers when event target is an input/textarea/contenteditable` (returns false).
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implement. A single `window` `keydown` listener in `App.svelte` calls `keybindings.handle(e)` and `preventDefault()` when true.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Commit `feat: command and keybinding registries`.

## Phase M2: Viewer

### Task 5: Rust file commands and file-opening flow

**Files:**
- Create: `src-tauri/src/error.rs`, `src-tauri/src/commands/mod.rs`, `src-tauri/src/commands/files.rs`, `src/core/ipc/api.ts`, `src/app/fileOpening.ts`
- Modify: `src-tauri/src/lib.rs`, `src-tauri/Cargo.toml`, `src-tauri/capabilities/default.json`

**Interfaces:**
- Produces (Rust):
```rust
#[derive(Debug, Serialize, thiserror::Error)]
#[serde(tag = "code", content = "message")]
pub enum AppError { NotFound(String), Locked(String), ReadOnly(String), Encrypted(String), InvalidPdf(String), Io(String) }

#[tauri::command] async fn open_pdf(path: String) -> Result<tauri::ipc::Response, AppError>; // raw bytes → ArrayBuffer in JS
#[tauri::command] fn get_launch_files(state: State<LaunchFiles>) -> Vec<String>;           // .pdf paths from argv, taken once
```
  Single-instance: second launch emits event `open-files` with `Vec<String>` of `.pdf` args and focuses the main window.
- Produces (TS):
```ts
export async function openPdf(path: string): Promise<ArrayBuffer>;
export async function getLaunchFiles(): Promise<string[]>;
export function isAppError(e: unknown): e is { code: AppErrorCode; message: string };
// fileOpening.ts
export async function pickAndOpen(): Promise<void>;                 // dialog filter *.pdf, multi-select
export function initFileOpening(open: (path: string) => Promise<void>): () => void; // drag-drop, launch files, open-files event
```

- [ ] **Step 1: Failing Rust test** in `files.rs`: `open_pdf_missing_file_returns_not_found` — call the inner fn `read_file(path) -> Result<Vec<u8>, AppError>` on a non-existent path → `matches!(err, AppError::NotFound(_))`. Also `read_file_returns_bytes` with a temp file.
- [ ] **Step 2:** `cargo test` → FAIL.
- [ ] **Step 3:** Implement `read_file` (map `io::ErrorKind::NotFound` → NotFound, `PermissionDenied` → Locked, else Io), `open_pdf` wraps it in `Response::new(bytes)`. Add `tauri-plugin-dialog`, `tauri-plugin-single-instance` (registered first in builder), `thiserror`. Capability `dialog:allow-open`, `dialog:allow-save`, `dialog:allow-message`.
- [ ] **Step 4:** `cargo test` → PASS.
- [ ] **Step 5:** Implement TS wrappers and `fileOpening.ts` (drag-drop via `getCurrentWebview().onDragDropEvent`, filter `.pdf` case-insensitively). Register commands `file.open` (Ctrl+O). Temporary: `console.log(byteLength)` on open; manual check with dialog, drag-drop, and `npm run tauri dev -- -- C:\path\file.pdf`.
- [ ] **Step 6:** Commit `feat: open PDFs via dialog, drag-drop, launch args, single instance`.

### Task 6: pdf.js engine, document sessions, tabs

**Files:**
- Create: `src/core/viewer/pdfEngine.ts`, `src/core/session/session.svelte.ts`, `src/app/tabs.svelte.ts`, `tests/app/tabs.test.ts`
- Modify: `src/app/Tabs.svelte`, `src/App.svelte`

**Interfaces:**
- Consumes: `openPdf`, `initFileOpening`, `commands`.
- Produces:
```ts
// pdfEngine.ts
export interface PdfDoc { numPages: number; getPage(i: number): Promise<PDFPageProxy>; destroy(): Promise<void> }
export async function loadPdf(data: ArrayBuffer): Promise<PdfDoc>;   // throws {code:'Encrypted'} on PasswordException
// session.svelte.ts
export class DocumentSession {
  readonly id: string; path: string; fileName: string;
  doc: PdfDoc; pageSizes: { width: number; height: number }[]; // rotated, at scale 1 (points)
  scale: number; scrollTop: number; scrollLeft: number; currentPage: number;
  dirty: boolean;                       // derived later from history (Task 9)
  static async open(path: string): Promise<DocumentSession>;
  dispose(): Promise<void>;
}
// tabs.svelte.ts
export class TabsStore {
  sessions: DocumentSession[]; activeId: string | null; readonly active: DocumentSession | null;
  add(s: DocumentSession): void;                // activates; if path already open (case-insensitive) activate existing instead
  close(id: string): Promise<void>;             // dirty prompt added in Task 17
  next(): void; prev(): void;
}
export const tabs: TabsStore;
```

- [ ] **Step 1: Failing tests** (use fake sessions `{id, path, dispose: vi.fn()}`): `add activates new session`; `add same path twice activates existing, keeps one tab`; `close active activates right neighbour, else left`; `close last leaves activeId null and calls dispose`; `next/prev wrap around`.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implement. pdf.js worker via `import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'`; `GlobalWorkerOptions.workerSrc = workerUrl`. Pass `cMapUrl`/`standardFontDataUrl` pointing at bundled copies (copy `pdfjs-dist/cmaps` and `standard_fonts` into `public/pdfjs/` via a Vite static-copy step) so text renders offline. `pageSizes` from `page.getViewport({scale:1})` for every page at open (getPage is cheap; do in parallel).
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Tabs UI: tab = file name (ellipsis, max 200px), "•" when dirty else × on hover, active tab `--surface` with `--text-strong`, "+" button runs `file.open`. Commands `tab.close` (Ctrl+W), `tab.next` (Ctrl+Tab), `tab.prev` (Ctrl+Shift+Tab). Window title updates to `<file name> — JuliePDF`. App shows EmptyState when `tabs.active` is null.
- [ ] **Step 6:** Commit `feat: pdf.js engine, document sessions, tabs`.

### Task 7: Layout and zoom math

**Files:**
- Create: `src/core/viewer/layout.ts`, `tests/core/viewer/layout.test.ts`

**Interfaces:**
- Produces:
```ts
export const PAGE_GAP = 16, MIN_SCALE = 0.1, MAX_SCALE = 8;
export interface Layout { tops: number[]; heights: number[]; widths: number[]; totalHeight: number; maxWidth: number }
export function computeLayout(sizes: { width: number; height: number }[], scale: number): Layout; // first top = PAGE_GAP
export function visibleRange(l: Layout, scrollTop: number, viewportH: number, overscan?: number): { first: number; last: number }; // overscan default 1
export function pageAt(l: Layout, y: number): number;            // page whose box (incl. half gaps) contains content-y
export function clampScale(s: number): number;
export function fitWidthScale(maxPageWidthPt: number, containerW: number): number; // (containerW - 32) / width, clamped
export function zoomAround(l0: Layout, l1: Layout, s0: number, s1: number, anchor: { x: number; y: number }, scroll: { top: number; left: number }, containerW: number): { top: number; left: number };
// keeps the document point under `anchor` (container coords) fixed
```

- [ ] **Step 1: Failing tests:**
  - `computeLayout([{width:600,height:800},{width:600,height:800}], 1)` → `tops [16, 832]`, `totalHeight 1648`.
  - same at scale 0.5 → `tops [16, 432]`, `heights [400,400]`.
  - `visibleRange` with tops above, `scrollTop 900`, `viewportH 500`, overscan 0 → `{first:1,last:1}`; overscan 1 → `{first:0,last:1}`.
  - `clampScale(20) === 8`, `clampScale(0.01) === 0.1`.
  - `fitWidthScale(600, 1232) === 2`.
  - `zoomAround` from 1→2 with anchor `{x:300,y:100}` and scroll `{top:0,left:0}`: the content point under the anchor before equals the one after (assert by recomputing `pageAt` and in-page offset within 0.5px).
  - **Review Focus 1**: `rotated page sizes are respected` — a 90°-rotated A4 page passed as `{width:842,height:595}` gives `heights[0] === 595` at scale 1.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implement (pages horizontally centred; binary search in `visibleRange`/`pageAt`).
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Commit `feat: viewer layout and zoom math`.

### Task 8: Virtualized viewer, rendering, zoom & page navigation

**Files:**
- Create: `src/core/viewer/Viewer.svelte`, `src/core/viewer/PageView.svelte`, `src/core/viewer/renderCache.ts`, `tests/core/viewer/renderCache.test.ts`
- Modify: `src/App.svelte`, `src/app/StatusBar.svelte`

**Interfaces:**
- Consumes: `DocumentSession`, layout functions.
- Produces:
```ts
export class RenderCache { constructor(maxEntries: number); get(key: string): ImageBitmap | undefined; set(key: string, bmp: ImageBitmap): void; } // LRU, closes evicted bitmaps; key `${page}@${scaleBucket}`
// Viewer exposes on the session: session.zoomTo(scale, anchor?), session.goToPage(i)
```
  Commands: `view.zoomIn` (Ctrl+= / Ctrl++, ×1.25), `view.zoomOut` (Ctrl+-, ÷1.25), `view.fitWidth` (Ctrl+0).

- [ ] **Step 1: Failing tests** `RenderCache evicts least recently used and calls close()`; `get refreshes recency`.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implement RenderCache (maxEntries 12).
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Viewer: one scroll container (`overflow:auto`), spacer of `totalHeight`, absolutely positioned `PageView`s only for `visibleRange(..., overscan 1)`. Each page: white box with soft shadow, canvas rendered at `scale * devicePixelRatio` via `page.render`, cancel in-flight render tasks when page leaves range. Ctrl+wheel: apply new scale immediately via CSS transform of current bitmaps, debounce 150ms then commit layout (`zoomAround`) and re-render. Touchpad pinch arrives as Ctrl+wheel — same path; use `deltaY` magnitude for smooth factor `Math.exp(-deltaY * 0.002)`. Default scale on open: `fitWidthScale`. Track `currentPage` via `pageAt(scrollTop + viewportH/3)`. Per-session scroll/scale restored when switching tabs.
- [ ] **Step 6:** StatusBar: prev/next, editable page input (Enter jumps, invalid reverts), "/ N", zoom −/+, zoom % (click → input, Enter applies), fullscreen button wired later.
- [ ] **Step 7:** Manual perf check on a 50+-page lecture PDF: first page visible < 300 ms after open (measure with `performance.now()` logged once, remove after), smooth scroll, crisp after zoom. Record numbers in commit message.
- [ ] **Step 8:** Commit `feat: virtualized continuous viewer with zoom and page navigation`.

## Phase M3: Annotation core

### Task 9: Annotation model, store, history

**Files:**
- Create: `src/core/session/model.ts` (Shared Types above + `newId()`), `src/core/session/store.svelte.ts`, `src/core/session/history.ts`, `src/core/session/commands.ts`, `tests/core/session/store.test.ts`, `tests/core/session/history.test.ts`
- Modify: `src/core/session/session.svelte.ts` (add `store`, `history`, `dirty` derived)

**Interfaces:**
- Produces:
```ts
export class AnnotationStore {
  byPage(page: number): Annotation[];     // insertion order = z-order
  get(id: string): Annotation | undefined;
  all(): Annotation[];
  add(a: Annotation): void; update(id: string, next: Annotation): void; remove(id: string): void;
  load(list: Annotation[]): void;         // from file; records ids present at load for save diffing
  deletedSourceRefs(): string[];          // sourceRefs of loaded/saved annotations no longer present
  changedSince(): Annotation[];           // annotations added/modified since load or last markSaved
  markSaved(refs: Record<string, string>): void; // applies returned sourceRefs, resets change tracking
}
export interface Command { label: string; do(s: AnnotationStore): void; undo(s: AnnotationStore): void }
export class History {
  constructor(store: AnnotationStore, limit = 200);
  execute(c: Command): void; undo(): boolean; redo(): boolean;
  readonly canUndo: boolean; readonly canRedo: boolean;
  readonly version: number;  // increments on execute/undo/redo
  markClean(): void; readonly isDirty: boolean; // dirty when version differs from clean version
}
export function addAnnotations(list: Annotation[]): Command;
export function updateAnnotation(before: Annotation, after: Annotation): Command;
export function deleteAnnotations(list: Annotation[]): Command;
```
  Commands `edit.undo` (Ctrl+Z), `edit.redo` (Ctrl+Y, Ctrl+Shift+Z) on the active session. Status bar undo/redo buttons use `canUndo/canRedo`. `session.dirty = history.isDirty`.

- [ ] **Step 1: Failing tests:**
  - store: `add then byPage returns it`; `update replaces object`; `remove then deletedSourceRefs contains its sourceRef only if it had one`; `markSaved assigns sourceRefs and clears changedSince`; `re-adding a removed saved annotation (undo of delete) removes it from deletedSourceRefs`.
  - history: `execute/undo/redo round trip restores store state`; `execute after undo clears redo stack`; `limit drops oldest`; `isDirty false after markClean, true after execute, false again after undo back to clean version`.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implement (store uses `$state` maps keyed by page for fine-grained reactivity).
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Commit `feat: annotation model, store and undo/redo history`.

### Task 10: Annotation kinds and overlay

**Files:**
- Create: `src/core/registry/annotationKinds.ts`, `src/core/viewer/Overlay.svelte`, `src/core/geometry/stroke.ts` (path part), `src/annotations/ink/index.ts`, `src/annotations/ink/Render.svelte`, `tests/core/geometry/stroke.test.ts`
- Modify: `src/core/viewer/PageView.svelte`

**Interfaces:**
- Produces:
```ts
export interface AnnotationKind<A extends Annotation = Annotation> {
  kind: A['kind'];
  Render: Component<{ a: A; vp: PageViewport; selected: boolean }>;  // SVG <g>
  bounds(a: A): Rect;                                               // PDF space
  hitTest(a: A, p: Point, tolerancePt: number): boolean;
  translate(a: A, dx: number, dy: number): A;
  scale?(a: A, from: Rect, to: Rect): A;
}
export const annotationKinds: { register(k: AnnotationKind): void; get(kind: string): AnnotationKind };
// stroke.ts
export function smoothPath(points: Point[], toScreen: (p: Point) => Point): string; // SVG d using midpoint-quadratic scheme
```
  Midpoint-quadratic scheme (shared with Rust Task 15): `M p0`; for i in 1..n-2: `Q p_i mid(p_i, p_{i+1})`; then `L p_{n-1}`. 1 point → zero-length round-capped segment. 2 points → `M p0 L p1`.
  Overlay: absolutely positioned SVG over the canvas, same CSS size; renders `store.byPage(page)` via registry; marker-role ink with `mix-blend-mode: multiply`. Pointer routing is wired in Task 12 once the tool registry exists: it forwards pointer events (with `setPointerCapture`) to the active tool handler as `PagePointerEvent { page, pdf: Point, screen: Point, vp: PageViewport, native: PointerEvent }` using `vp.convertToPdfPoint`.

- [ ] **Step 1: Failing tests:** `smoothPath with identity transform for [[0,0],[10,0],[20,10]] === "M0 0 Q10 0 15 5 L20 10"`; `two points produce M/L`; `single point produces zero-length segment "M5 5 L5 5"`.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implement smoothPath, registry, ink kind (Render = `<path>` with `stroke-width = width * vp.scale`, round caps/joins, `stroke-opacity = opacity`; hitTest = point-to-segment distance ≤ width/2 + tolerance; translate/scale map points), Overlay.
- [ ] **Step 4:** `npm test` → PASS. Manual: temporarily add a hard-coded ink annotation in dev → visible, stays aligned while zooming, on a rotated page too.
- [ ] **Step 5:** Commit `feat: annotation kind registry, SVG overlay, ink rendering`.

### Task 11: Tool registry, settings persistence, toolbar instances

**Files:**
- Create: `src/core/registry/tools.ts`, `src/core/settings/settings.svelte.ts`, `src-tauri/src/commands/settings.rs`, `tests/core/registry/tools.test.ts`, `tests/core/settings/settings.test.ts`
- Modify: `src-tauri/src/lib.rs`, `src/core/ipc/api.ts`

**Interfaces:**
- Produces:
```ts
export interface ToolDefinition<S = any> {
  type: string; displayName: string; description: string; shortcut?: string; // single letter
  Icon: Component<{ settings: S; size: number }>;
  defaultSettings: S;
  Options: Component<{ settings: S; update(patch: Partial<S>): void }> | null;
  cursor?(settings: S): string;
  allowMultipleInstances: boolean;
  createHandler(ctx: ToolContext, settings: () => S): ToolHandler;
}
export interface ToolHandler { onPointerDown?(e: PagePointerEvent): void; onPointerMove?(e: PagePointerEvent): void; onPointerUp?(e: PagePointerEvent): void; onKeyDown?(e: KeyboardEvent): boolean; onDeactivate?(): void }
export interface ToolContext { session: DocumentSession; execute(c: Command): void; selection: { ids: string[]; set(ids: string[]): void }; preview: { set(a: Annotation | null): void } } // preview = live, uncommitted annotation drawn by Overlay
export const toolRegistry: { register(d: ToolDefinition): void; get(type: string): ToolDefinition; list(): ToolDefinition[] };

export interface ToolInstance { instanceId: string; type: string; settings: unknown }
export interface Settings { version: 1; author: string; toolbar: ToolInstance[]; activeInstanceId: string | null; hints: Record<string, boolean> }
export class SettingsStore {
  data: Settings;
  async load(): Promise<void>;                      // falls back to defaults on missing/corrupt/unknown version
  addInstance(type: string): ToolInstance; duplicate(instanceId: string): ToolInstance; remove(instanceId: string): void;
  move(instanceId: string, toIndex: number): void; updateSettings(instanceId: string, patch: object): void;
  setActive(instanceId: string): void;              // all mutations schedule a debounced (500 ms) save
}
export const settings: SettingsStore;
export function defaultToolbar(): ToolInstance[];   // Select, Hand, Marker(yellow, text), Pen(red), Text, Eraser
```
  Rust: `load_settings() -> Result<Option<serde_json::Value>, AppError>`, `save_settings(value: serde_json::Value) -> Result<(), AppError>`; file `%APPDATA%\JuliePDF\settings.json` via `app.path().app_config_dir()`; write temp + rename.

- [ ] **Step 1: Failing tests:**
  - tools: `register then get`; `list preserves registration order`; `registering duplicate type throws`.
  - settings (mock ipc): `load with null returns defaultToolbar of 6 instances in order select, hand, marker, pen, text, eraser`; `load with corrupt/unknown version falls back to defaults`; `addInstance appends with defaultSettings`; `duplicate copies settings with new instanceId`; `addInstance of tool with allowMultipleInstances=false when one exists returns existing`; `remove active instance activates first instance`; `mutations trigger exactly one save after 500 ms` (fake timers).
  - Rust: `save_then_load_roundtrips` using a temp dir.
- [ ] **Step 2:** Run both → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test`, `cargo test` → PASS.
- [ ] **Step 5:** Commit `feat: tool registry and persisted toolbar settings`.

### Task 12: Toolbar UI, options flyout, "+" picker, shared widgets

**Files:**
- Create: `src/toolbar/Toolbar.svelte`, `src/toolbar/ToolPicker.svelte`, `src/ui/ColorPicker.svelte`, `src/ui/Slider.svelte`, `src/ui/Segmented.svelte`, `src/ui/Flyout.svelte`, `src/ui/Modal.svelte`, `src/ui/ContextMenu.svelte`, `src/ui/Toast.svelte`, `src/ui/toasts.svelte.ts`, `tests/ui/ColorPicker.test.ts`, `tests/toolbar/Toolbar.test.ts`
- Modify: `src/App.svelte`

**Interfaces:**
- Consumes: `toolRegistry`, `settings`.
- Produces: `<ColorPicker value: RGB presets: RGB[] onchange />` (preset swatches + native `<input type="color">` for custom), `<Slider min max step value format onchange />`, `<Segmented options value onchange />`, `toasts.show(msg: string, kind?: 'info'|'error', action?: {label: string, run(): void})`; `activeTool` derived store `{ def, instance }`.

- [ ] **Step 1: Failing tests:**
  - ColorPicker: `clicking preset emits its RGB`; `custom hex #ff0000 emits [1,0,0]`.
  - Toolbar (with fake registry of two tools): `renders one button per instance`; `clicking inactive instance activates it`; `clicking active instance opens options flyout`; `Escape closes flyout`; `"+" opens picker listing registered tools with description`; `choosing a tool in picker appends instance and closes picker`.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implement. Toolbar: `--bg-deep`, buttons 40×40, radius 8, active = `--accent-soft` background + 2px `--accent` left indicator; icons from `Icon` component (colour-aware); "+" pinned bottom; right-click → ContextMenu (Options / Duplicate / Remove; Duplicate hidden when `allowMultipleInstances` false); drag-to-reorder with pointer events (`settings.move`). Flyout opens left of the strip, aligned to button, `--surface`, one soft shadow. Picker: Modal with dimmed backdrop, card grid (icon, name, description). Letter shortcuts: register per tool type `tool.<type>` commands bound to `shortcut`; pressing selects first instance of the type, pressing again cycles instances.
- [ ] **Step 4:** `npm test` → PASS. Manual: add/duplicate/remove/reorder; restart app → toolbar restored.
- [ ] **Step 5:** Commit `feat: toolbar with options flyout, tool picker and shared widgets`.

## Phase M4: First tools

### Task 13: Pen tool

**Files:**
- Create: `src/tools/pen/index.ts`, `src/tools/pen/Options.svelte`, `src/tools/pen/Icon.svelte`, `src/tools/index.ts`, extend `src/core/geometry/stroke.ts`, extend `tests/core/geometry/stroke.test.ts`

**Interfaces:**
- Produces:
```ts
export interface PenSettings { color: RGB; width: number; opacity: number } // default {color:[0.898,0.224,0.208], width:2, opacity:1}
export function simplify(points: Point[], tolerance: number): Point[];      // Ramer–Douglas–Peucker, keeps endpoints
export function dedupe(points: Point[], minDist: number): Point[];
export const PEN_PRESETS: RGB[]; // black #000000, red #E53935, blue #1E88E5, green #43A047, amber #FFC107, white #FFFFFF
```

- [ ] **Step 1: Failing tests:** `simplify removes collinear middle point` (`[[0,0],[5,0],[10,0]]` tol 0.1 → `[[0,0],[10,0]]`); `simplify keeps corner` (`[[0,0],[10,0],[10,10]]` unchanged); `dedupe drops points closer than minDist`.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implement. Handler: pointerdown starts stroke; pointermove uses `getCoalescedEvents()` and updates `ctx.preview` once per animation frame; pointerup → `dedupe(…, 0.5/scale)` → `simplify(…, 0.35/scale)` (tolerances in PDF pt) → `ctx.execute(addAnnotations([ink role 'pen', blend 'normal']))`. Options: ColorPicker (PEN_PRESETS), width Slider 0.5–20 step 0.5, opacity Slider 10–100%. Icon = pen glyph tinted with colour. `allowMultipleInstances: true`, shortcut `P`, cursor crosshair. Register in `tools/index.ts` (imported once from `main.ts`).
- [ ] **Step 4:** `npm test` → PASS. Manual: draw with mouse (and pen if available), zoom → aligned, undo/redo.
- [ ] **Step 5:** Commit `feat: pen tool`.

### Task 14: Hand tool, temporary pan, eraser

**Files:**
- Create: `src/tools/hand/*`, `src/tools/eraser/*`, `src/core/geometry/hit.ts`, `tests/core/geometry/hit.test.ts`
- Modify: `src/core/viewer/Viewer.svelte` (Space / middle-button pan), `src/tools/index.ts`

**Interfaces:**
- Produces:
```ts
export function distToSegment(p: Point, a: Point, b: Point): number;
export function pointInQuad(p: Point, q: Quad): boolean;
export function hitAnnotations(list: Annotation[], p: Point, tolerancePt: number): Annotation[]; // topmost first, uses annotationKinds
```
  Eraser: radius 6 screen px → `6 / scale` pt; erases `ink` and `highlight` only; all annotations erased during one drag = one `deleteAnnotations` command; erased items hidden immediately during the drag. Hand: drag pans scroll container; Space held or middle button → temporary pan in any tool (cursor `grab`/`grabbing`), not while typing in a text box.

- [ ] **Step 1: Failing tests:** `distToSegment([5,5],[0,0],[10,0]) === 5`; `distToSegment beyond endpoint uses endpoint`; `pointInQuad inside/outside`; `hitAnnotations returns topmost first and ignores freetext when filtered by eraser predicate`.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implement hit.ts, hand, eraser (shortcuts `H`, `E`; `allowMultipleInstances: false`; no Options).
- [ ] **Step 4:** `npm test` → PASS. Manual: erase several strokes in one drag, single undo restores all.
- [ ] **Step 5:** Commit `feat: hand tool, temporary pan, stroke eraser`.

## Phase M5: Save & reopen (de-risk early)

### Task 15: Rust DTO, WinAnsi, ink appearance

**Files:**
- Create: `src-tauri/src/pdf/mod.rs`, `dto.rs`, `winansi.rs`, `appearance.rs`
- Modify: `src-tauri/Cargo.toml` (add `lopdf`, `serde_json`, `uuid`, `chrono`)

**Interfaces:**
- Produces:
```rust
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Common { pub id: String, pub page: u32, pub source_ref: Option<String>, pub modified_at: String, pub author: String }

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum AnnotationDto {
  Highlight { #[serde(flatten)] common: Common, quads: Vec<[f32; 8]>, color: [f32; 3], opacity: f32 },
  Ink { #[serde(flatten)] common: Common, strokes: Vec<Vec<[f32; 2]>>, color: [f32; 3], width: f32, opacity: f32, blend: Blend, role: InkRole },
  Freetext { #[serde(flatten)] common: Common, rect: [f32; 4], text: String, lines: Vec<String>, #[serde(rename = "fontSize")] font_size: f32, #[serde(rename = "textColor")] text_color: [f32; 3], background: Option<Background> },
}
pub enum Blend { Normal, Multiply }   // serde lowercase
pub enum InkRole { Pen, Marker }      // serde lowercase
pub struct Background { pub color: [f32; 3], pub opacity: f32 }

pub struct Appearance { pub bbox: [f32; 4], pub content: Vec<u8>, pub opacity: f32, pub multiply: bool, pub uses_helvetica: bool, pub matrix: Option<[f32; 6]> }
pub fn ink_appearance(strokes: &[Vec<[f32; 2]>], color: [f32; 3], width: f32, opacity: f32, multiply: bool) -> Appearance;
pub fn encode_winansi(s: &str) -> Vec<u8>;   // unmappable chars → b'?'
```
  Ink AP: bbox = stroke bounds expanded by width/2 + 1; content `q {w} w 1 J 1 j {r g b} RG /GS0 gs` + path (midpoint-quadratic converted to cubic: `c1 = p0 + 2/3(c − p0)`, `c2 = p1 + 2/3(c − p1)`) + `S Q`. `GS0` carries `/CA opacity` and `/BM /Multiply` when multiply.

- [ ] **Step 1: Failing tests:**
  - `dto_json_matches_ts_shape`: deserialize `{"kind":"ink","id":"a","page":0,"sourceRef":null,"modifiedAt":"2026-11-18T10:00:00Z","author":"JuliePDF","strokes":[[[0,0],[10,0]]],"color":[1,0,0],"width":2,"opacity":1,"blend":"normal","role":"pen"}` and re-serialize equal (as `serde_json::Value`).
  - `ink_appearance_bbox_includes_half_width`: stroke `[[10,10],[20,10]]`, width 4 → bbox `[7,7,23,13]`.
  - `ink_appearance_contains_curve_ops`: 3-point stroke content contains `" c\n"` and ends with `"S\nQ\n"`; 2-point contains `" l\n"`.
  - `ink_appearance_multiply_flag`: multiply true → `appearance.multiply`.
  - `winansi_keeps_umlauts`: `encode_winansi("äöüß")` == `[0xE4,0xF6,0xFC,0xDF]`; `winansi_replaces_emoji`: `encode_winansi("a😀")` == `b"a?"`; `winansi_maps_euro`: `"€"` → `[0x80]`.
- [ ] **Step 2:** `cargo test` → FAIL.
- [ ] **Step 3:** Implement (WinAnsi table for 0x80–0x9F specials; Latin-1 range direct).
- [ ] **Step 4:** `cargo test` → PASS.
- [ ] **Step 5:** Commit `feat(rust): annotation DTO, WinAnsi encoding, ink appearance streams`.

### Task 16: Incremental writer, reader, save/read commands

**Files:**
- Create: `src-tauri/src/pdf/writer.rs`, `src-tauri/src/pdf/reader.rs`, `src-tauri/tests/fixtures.rs`, `src-tauri/tests/roundtrip.rs`
- Modify: `src-tauri/src/commands/files.rs`, `src-tauri/src/lib.rs`

**Interfaces:**
- Produces:
```rust
pub fn write_incremental(original: &[u8], upserts: &[AnnotationDto], deletes: &[String]) -> Result<(Vec<u8>, HashMap<String, String>), AppError>;
// returns new file bytes and id → sourceRef ("12R") for every upserted annotation
pub fn read_annotations(bytes: &[u8]) -> Result<Vec<AnnotationDto>, AppError>;

#[derive(Serialize)] #[serde(rename_all = "camelCase")] pub struct SaveResult { pub refs: HashMap<String, String> }
#[tauri::command] async fn save_pdf(source_path: String, target_path: String, upserts: Vec<AnnotationDto>, deletes: Vec<String>) -> Result<SaveResult, AppError>;
#[tauri::command] async fn read_annotations(path: String) -> Result<Vec<AnnotationDto>, AppError>; // in commands::files; calls pdf::reader::read_annotations
```
  Writer rules: use `lopdf::IncrementalDocument` over `original`. Upsert with `source_ref` → new revision of the same object id; without → new object, appended to the page's `/Annots` (page object revised; if `/Annots` is an indirect array, revise that array object). Deletes → remove ref from page `/Annots`. Each annotation dict: `/Type /Annot /Subtype … /Rect /NM /M (D:…) /T /F 4 /C /CA /AP << /N stream >> /P page /JuliePDF << /v 1 /role … /blend … >>` plus subtype keys (`/InkList`, `/BS << /W w >>`; `/QuadPoints`; `/DA /Contents /DS`). Encrypted input → `AppError::Encrypted`. Unparseable → `InvalidPdf`.
  `save_pdf`: read source, `write_incremental`, write to `tempfile::NamedTempFile` in target's directory, `sync_all`, `persist(target)`; `PermissionDenied`/sharing violation → `Locked` (or `ReadOnly` if the file has the read-only attribute); original untouched on any error.
  Reader rules: iterate pages' `/Annots`; map `/Ink`, `/Highlight`, `/FreeText` to DTOs (`/JuliePDF` values win; otherwise defaults: colour `/C` or black, opacity `/CA` or 1, width `/BS /W` or 1, role pen, blend normal; FreeText font size and colour parsed from `/DA` like `/Helv 12 Tf 0 0 0 rg`, default 12/black; `lines` returned empty — frontend recomputes); `id` = `/NM` or new UUID; `source_ref` = `"{num}R"` (gen ≠ 0 → `"{num}R{gen}"`); skip other subtypes.

- [ ] **Step 1: Fixtures** in `tests/fixtures.rs`: `fn simple_pdf(pages: usize) -> Vec<u8>` (A4, one text line per page, built with lopdf); `fn rotated_pdf() -> Vec<u8>` (`/Rotate 90`); `fn pdf_with_foreign_annots() -> Vec<u8>` (one `/Ink` without `/AP` and `/JuliePDF`, one `/Link`).
- [ ] **Step 2: Failing tests** in `roundtrip.rs`:
  - `original_bytes_are_prefix`: output starts with the original bytes exactly.
  - `ink_roundtrip`: write one ink → `read_annotations` returns one equal DTO (except `source_ref` now set and `lines`).
  - `returns_source_refs_for_new_annotations`: refs map has the id, format matches `^\d+R(\d+)?$`.
  - **Review Focus 2** `edit_after_save_replaces_not_duplicates`: save A; modify A's colour with its `source_ref`; save again → reading returns exactly one annotation with the new colour.
  - `delete_removes_from_annots`: save A, then save with `deletes=[A.sourceRef]` → reader returns 0.
  - **Review Focus 4** `foreign_annotations_loaded_and_link_preserved`: `pdf_with_foreign_annots` → reader returns the ink with defaults; after writing a new ink, the `/Link` dict is still in the page `/Annots`, byte-identical object.
  - `page_without_annots_array_gets_one`; `page_with_indirect_annots_array_is_updated`.
  - **Review Focus 5** `save_to_locked_file_returns_locked_and_keeps_original`: open target with an exclusive share mode (`std::os::windows::fs::OpenOptionsExt::share_mode(0)`), call the save fn → `Err(Locked)`, file bytes unchanged.
  - `output_reloads_with_lopdf`: `lopdf::Document::load_mem(&out)` succeeds.
- [ ] **Step 3:** `cargo test` → FAIL.
- [ ] **Step 4:** Implement writer, reader, commands.
- [ ] **Step 5:** `cargo test` → PASS. If `qpdf` is installed, `qpdf --check` on a written fixture → "No syntax or stream encoding errors found".
- [ ] **Step 6:** Commit `feat(rust): incremental annotation writer, reader, save command`.

### Task 17: Save flow, reopen, dirty state, close prompts

**Files:**
- Modify: `src/core/ipc/api.ts`, `src/core/session/session.svelte.ts`, `src/core/viewer/PageView.svelte`, `src/app/tabs.svelte.ts`, `src/App.svelte`
- Create: `src/app/saveFlow.ts`, `src/app/ConfirmClose.svelte`, `tests/app/saveFlow.test.ts`

**Interfaces:**
- Consumes: `save_pdf`, `read_annotations`, `AnnotationStore.changedSince/deletedSourceRefs/markSaved`, `History.markClean`.
- Produces:
```ts
export async function readAnnotations(path: string): Promise<Annotation[]>;
export async function savePdf(sourcePath: string, targetPath: string, upserts: Annotation[], deletes: string[]): Promise<{ refs: Record<string, string> }>;
export async function saveSession(s: DocumentSession, targetPath?: string): Promise<boolean>; // false on error (toast shown)
export async function confirmAndClose(s: DocumentSession): Promise<boolean>;                 // Save / Don't save / Cancel
```
  Commands `file.save` (Ctrl+S; no-op if not dirty), `file.saveAs` (Ctrl+Shift+S; save dialog, `.pdf`; afterwards the tab points at the new path). Tab close and window `onCloseRequested` go through `confirmAndClose` for every dirty session. Errors → `toasts.show(message, 'error', {label:'Save As…', run})` for `Locked`/`ReadOnly`. On open: `DocumentSession.open` loads bytes and annotations in parallel, recomputes `lines` for freetext (Task 20 adds the function; until then pass through), `store.load(list)`.
  **Managed-annotation suppression**: render pages with `annotationMode: AnnotationMode.ENABLE_STORAGE` and set `doc.annotationStorage.setValue(sourceRef, { noView: true })` for every loaded annotation's `sourceRef` before first render. Step 1 below verifies this mechanism; if pdf.js ignores it, fall back to rendering with `AnnotationMode.DISABLE` (foreign annotations then not drawn — record the limitation in the commit message and a TODO in `pdfEngine.ts`).

- [ ] **Step 1: Spike check**: open a fixture-written PDF (from Task 16, save one to disk via a tiny `cargo test -- --ignored write_sample` helper that writes `target/sample-annotated.pdf`) and confirm each ink is drawn once (overlay only) and a foreign `/Link`/stamp still renders. Record which mechanism worked.
- [ ] **Step 2: Failing tests** (mock api): `saveSession sends changedSince as upserts and deletedSourceRefs as deletes`; `saveSession on success calls markSaved(refs) and markClean`; `saveSession on Locked shows error toast with Save As action and keeps dirty`; `confirmAndClose returns true without prompting when not dirty`.
- [ ] **Step 3:** `npm test` → FAIL.
- [ ] **Step 4:** Implement.
- [ ] **Step 5:** `npm test` → PASS.
- [ ] **Step 6: Cross-viewer check**: draw pens on a real lecture PDF, Ctrl+S, open the file in Microsoft Edge, Chrome and Acrobat Reader (and Drawboard if installed) → strokes identical in place, colour, thickness. Reopen in JuliePDF → strokes editable, not doubled. Edit one, save, reopen → no duplicates.
- [ ] **Step 7:** Commit `feat: save/save as, reopen with editable annotations, unsaved-change prompts`.

## Phase M6–M8: Marker, text box, select

### Task 18: Marker tool — freehand mode

**Files:**
- Create: `src/tools/marker/index.ts`, `src/tools/marker/Options.svelte`, `src/tools/marker/Icon.svelte`, `src/tools/marker/freehand.ts`, `tests/tools/marker/freehand.test.ts`

**Interfaces:**
- Produces:
```ts
export interface MarkerSettings { mode: 'text' | 'freehand'; color: RGB; opacity: number; width: number } // default {mode:'text', color:[1,0.922,0.231], opacity:0.4, width:14}
export const MARKER_PRESETS: RGB[]; // #FFEB3B, #76FF03, #18FFFF, #FF4081, #FFAB40, #B388FF
export function straightLine(start: Point, current: Point): Point[];  // Shift-constrained: [start, current]
```
  Freehand = pen pipeline with `role:'marker'`, `blend:'multiply'`, flat look (round caps). Shift held at any time during the drag → stroke becomes `straightLine(start, current)`. Options: Segmented (Text / Freehand), ColorPicker, opacity 10–100%, thickness 4–40 pt (only shown in freehand mode). Shortcut `M`, `allowMultipleInstances: true`.

- [ ] **Step 1: Failing tests:** `straightLine returns exactly two points`; `marker freehand handler commits ink with role marker and blend multiply` (drive handler with fake ctx: down/move/up → `execute` called with an `addAnnotations` whose annotation has those fields).
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implement (reuse `dedupe`/`simplify`; mode `text` handled in Task 19 — until then text mode behaves as freehand).
- [ ] **Step 4:** `npm test` → PASS. Manual: translucent strokes, text beneath readable, overlapping strokes don't darken text beyond multiply; save → check in Edge.
- [ ] **Step 5:** Commit `feat: marker tool freehand mode`.

### Task 19: Marker tool — text-selection mode and highlight annotations

**Files:**
- Create: `src/core/geometry/quads.ts`, `src/annotations/highlight/index.ts`, `src/annotations/highlight/Render.svelte`, `src/tools/marker/textMode.ts`, `tests/core/geometry/quads.test.ts`
- Modify: `src/core/viewer/PageView.svelte` (text layer), `src/tools/marker/index.ts`, `src-tauri/src/pdf/appearance.rs`, `src-tauri/src/pdf/writer.rs`, `src-tauri/tests/roundtrip.rs`

**Interfaces:**
- Produces:
```ts
export interface ScreenRect { left: number; top: number; right: number; bottom: number }
export function rectsToQuads(rects: ScreenRect[], toPdf: (x: number, y: number) => Point, lineTolerancePx?: number): Quad[];
// drop rects < 1px wide/high; merge rects whose vertical centres differ ≤ tolerance (default 3px) and that overlap/touch horizontally (gap ≤ 4px) into one rect per line fragment; map corners to PDF; output TL, TR, BL, BR order
export function pageHasText(page: PDFPageProxy): Promise<boolean>; // textContent.items has any non-whitespace str; cached per page
```
```rust
pub fn highlight_appearance(quads: &[[f32; 8]], color: [f32; 3], opacity: f32) -> Appearance; // filled quads, multiply, bbox = union
```
  Text layer: pdf.js `TextLayer` rendered for visible pages only, transparent text, `::selection` tinted with marker colour at reduced alpha while marker text mode is active. Marker text mode: overlay lets pointer events through to the text layer (`pointer-events:none` on SVG background) so native selection works; on `pointerup`, read `window.getSelection()` ranges within that page's text layer, `getClientRects()` → `rectsToQuads` → one `HighlightAnnotation` → execute; clear selection. A selection spanning multiple pages creates one highlight per page. If `pageHasText` is false: behave as freehand and show `toasts.show('No selectable text on this page — using freehand marker')` once per app run (persist flag in `settings.data.hints.markerFallback`).

- [ ] **Step 1: Failing tests:**
  - `rectsToQuads merges two rects on the same line into one quad`.
  - `rectsToQuads keeps separate lines separate` (two rects 20px apart vertically → 2 quads).
  - `rectsToQuads drops zero-size rects`.
  - `quad corner order is TL,TR,BL,BR in PDF space` (with a toPdf that flips y: `(x,y)=>[x, 800-y]`, rect `{left:10,top:100,right:50,bottom:110}` → `[10,700,50,700,10,690,50,690]`).
  - Rust `highlight_roundtrip` and `highlight_appearance_uses_multiply`.
- [ ] **Step 2:** `npm test`, `cargo test` → FAIL.
- [ ] **Step 3:** Implement highlight kind (Render = filled polygons with `mix-blend-mode: multiply`, hitTest = `pointInQuad` any, translate shifts quads), text mode, Rust appearance + writer/reader support.
- [ ] **Step 4:** Both test suites → PASS. Manual on a selectable lecture PDF: multi-line selection highlights each line tightly; scanned PDF falls back with hint; save → Edge/Acrobat show highlights in place.
- [ ] **Step 5:** Commit `feat: marker text-selection mode with standard highlight annotations`.

### Task 20: Text box tool and FreeText annotations

**Files:**
- Create: `src/core/geometry/textLayout.ts`, `src/annotations/freetext/index.ts`, `src/annotations/freetext/Render.svelte`, `src/annotations/freetext/Editor.svelte`, `src/tools/text/index.ts`, `src/tools/text/Options.svelte`, `src/tools/text/Icon.svelte`, `tests/core/geometry/textLayout.test.ts`
- Modify: `src/core/viewer/Overlay.svelte`, `src/core/session/session.svelte.ts` (recompute lines on load), `src-tauri/src/pdf/appearance.rs`, `writer.rs`, `reader.rs`, `src-tauri/tests/roundtrip.rs`

**Interfaces:**
- Produces:
```ts
export interface TextSettings { textColor: RGB; fontSize: number; background: { color: RGB; opacity: number } | null } // default {textColor:[0.1,0.1,0.1], fontSize:12, background:null}
export const TEXT_PADDING = 4, LINE_HEIGHT = 1.2, DEFAULT_BOX_WIDTH = 200; // pt
export function wrapText(text: string, fontSize: number, maxWidth: number, measure: (s: string, size: number) => number): string[];
// respects \n; greedy word wrap; words longer than maxWidth broken by character
export function boxRect(origin: Point, width: number, lines: number, fontSize: number): Rect; // top-left origin in PDF; height = lines*fontSize*LINE_HEIGHT + 2*TEXT_PADDING
export function measureHelvetica(s: string, size: number): number; // canvas measureText with "Arial" (Helvetica-metric-compatible)
```
```rust
pub fn freetext_appearance(rect: [f32; 4], lines: &[String], font_size: f32, text_color: [f32; 3], background: Option<&Background>, page_rotation: i32) -> Appearance;
// /Helv = Helvetica WinAnsiEncoding in AP resources; bg filled with own GS opacity; text via encode_winansi; for rotation 90/180/270 sets matrix so text reads upright on screen
```
  Tool behaviour: click on a page → creates box at click point (top-left), width `DEFAULT_BOX_WIDTH`, enters edit mode (Editor = positioned `<textarea>` in overlay with matching font metrics, auto-grow); Esc or click outside commits (`addAnnotations`), empty text discards. Editing an existing box (double-click with Select or click with Text tool on a box) commits `updateAnnotation`. While editing, global letter shortcuts are suppressed (Task 4 rule). Options: text ColorPicker (PEN_PRESETS), font size Slider 8–72, background Segmented (Transparent / Colour) + ColorPicker + opacity 0–100%. Shortcut `T`, `allowMultipleInstances: true`.

- [ ] **Step 1: Failing tests:**
  - `wrapText splits on newline`; `wrapText wraps words at maxWidth` (measure = `s.length * size * 0.5`: `"aa bb cc"`, size 10, maxWidth 30 → `["aa bb", "cc"]`); `wrapText breaks overlong word`.
  - `boxRect height for 2 lines at 10pt === 32` (2*10*1.2 + 8).
  - Rust: `freetext_roundtrip` (text, fontSize, colours, background survive), **Review Focus 3** `freetext_umlauts_survive_and_emoji_replaced` (AP content contains WinAnsi bytes for "Übung", `"😀"` → `?`; `/Contents` keeps full Unicode as UTF-16BE with BOM), **Review Focus 1** `freetext_on_rotated_page_has_counter_rotation_matrix` (rotation 90 → `appearance.matrix == Some([0,1,-1,0,…])`-style counter-rotation; assert non-identity).
- [ ] **Step 2:** Both suites → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Both suites → PASS. Manual: transparent and coloured-background boxes, umlauts, save → Edge/Acrobat/Chrome show identical text and background.
- [ ] **Step 5:** Commit `feat: text box tool with FreeText annotations`.

### Task 21: Select tool

**Files:**
- Create: `src/tools/select/index.ts`, `src/tools/select/Icon.svelte`, `src/tools/select/SelectionOptions.svelte`, `src/tools/select/handles.ts`, `tests/tools/select/handles.test.ts`
- Modify: `src/core/viewer/Overlay.svelte` (selection box + handles), `src/toolbar/Toolbar.svelte` (flyout shows SelectionOptions when selection non-empty)

**Interfaces:**
- Produces:
```ts
export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
export function resizeRect(r: Rect, h: Handle, dx: number, dy: number, minSize: number): Rect;
export function handleAt(r: Rect, p: Point, tolerancePt: number): Handle | null;
```
  Behaviour: click annotation → select (topmost via `hitAnnotations`); click empty → deselect, and drag on text selects text natively (Ctrl+C copies via browser default); drag selected → live translate, one `updateAnnotation` on release; handles: freetext → `e`/`w` only (width; lines re-wrapped), ink → all 8 (proportional `scale`), highlight → none; Delete/Backspace → `deleteAnnotations`; double-click freetext → edit (Task 20 Editor). Selection options flyout edits the selected annotation's colour/opacity/width/fontSize/background via `updateAnnotation` (one command per committed change). Shortcut `V`, `allowMultipleInstances: false`, default active tool.

- [ ] **Step 1: Failing tests:** `resizeRect se grows by dx,dy`; `resizeRect w moves x1 and keeps x2`; `resizeRect enforces minSize`; `handleAt returns se near bottom-right corner, null in centre`.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test` → PASS. Manual: move/resize/recolour/delete each kind; each action is one undo step; changes persist after save/reopen.
- [ ] **Step 5:** Commit `feat: select tool with move, resize, edit and delete`.

## Phase M9–M10: Fullscreen, polish, packaging

### Task 22: Fullscreen, shortcuts, robustness

**Files:**
- Create: `src/app/fullscreen.svelte.ts`, `tests/app/fullscreen.test.ts`
- Modify: `src/App.svelte`, `src/app/StatusBar.svelte`, `src/core/viewer/pdfEngine.ts`, `src/app/fileOpening.ts`

**Interfaces:**
- Produces: `fullscreen: { active: boolean; toggle(): Promise<void>; exit(): Promise<void> }`; commands `view.fullscreen` (F11, status-bar button), Escape → `exit` when active (after closing flyouts/deselecting — Escape priority: editor → flyout/modal → selection → fullscreen).

- [ ] **Step 1: Failing tests** (mock window API): `toggle sets active and calls setFullscreen(true)`; `exit when inactive does nothing`; `Escape priority closes flyout before exiting fullscreen` (via a small `escapeChain` helper exported from `fullscreen.svelte.ts`).
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implement. Fullscreen hides title bar, toolbar, status bar (grid collapses to the viewer only); viewer keeps scroll position anchored on current page; tool handlers and shortcuts keep working.
- [ ] **Step 4:** Robustness: encrypted PDF → toast "Encrypted PDFs are not supported yet", no tab opened; corrupt/non-PDF → "This file could not be opened as a PDF"; missing file from launch args → toast; all verified manually with sample files.
- [ ] **Step 5:** `npm test` → PASS. Verify the full shortcut table in spec §5.6 manually, one by one.
- [ ] **Step 6:** Commit `feat: fullscreen mode and error handling polish`.

### Task 23: Performance pass

**Files:**
- Modify: whichever files the measurements implicate (expected: `Viewer.svelte`, `PageView.svelte`, `renderCache.ts`, `writer.rs`)

- [ ] **Step 1:** Build release: `npm run tauri build`. Measure on a real 50+-page lecture PDF with ~100 annotations: window visible time, first-page time, scroll smoothness (DevTools Performance panel, enable via `devtools` feature in a debug build), save time (log in Rust with `Instant`), idle RAM (Task Manager, all JuliePDF + WebView2 processes).
- [ ] **Step 2:** Compare against Global Constraints budget; fix each miss (likely levers: overscan, render scale cap at very high zoom, deferring text layer until idle, caching parsed `lopdf` document).
- [ ] **Step 3:** Re-measure; all budget items met or the remaining gap written down in `docs/superpowers/plans/2026-11-18-juliepdf-mvp.md` under a "Performance notes" heading.
- [ ] **Step 4:** Commit `perf: meet MVP performance budget` with measured numbers in the message.

### Task 24: Icons, installer, file association

**Files:**
- Create: `src-tauri/icons/source.svg` (rounded square `#0F111A`, Amber `#FFC107` lowercase "j", Segoe UI Variable Display Semibold converted to path)
- Modify: `src-tauri/tauri.conf.json`

- [ ] **Step 1:** Generate icons: export source.svg to 1024px PNG, run `npm run tauri icon src-tauri/icons/source.png`. Check the 16px and 32px icons are legible.
- [ ] **Step 2:** `tauri.conf.json` bundle: `targets: ["nsis"]`, NSIS `installMode: "currentUser"`, `fileAssociations: [{ ext: ["pdf"], name: "PDF Document", description: "PDF Document", role: "Editor" }]`, version `0.1.0`, publisher/copyright "JuliePDF".
- [ ] **Step 3:** `npm run tauri build` → installer in `src-tauri/target/release/bundle/nsis/`; size < 15 MB.
- [ ] **Step 4:** Install, set "Open with → JuliePDF" on a PDF, double-click → opens; double-click a second PDF while running → opens as tab in the same window.
- [ ] **Step 5:** Commit `build: app icons, NSIS installer, .pdf file association`.

## Performance notes

Measured 2026-11-19 (Task 23) on the development machine: Windows 11, display at 250 % scaling (devicePixelRatio 2.5), 1280x800 window. Release build (`npm run tauri build`). Fixtures are generated by `src-tauri/tests/fixtures.rs::lecture_pdf`: 50 A4 slide pages, each with text, vector lines and its own RGB image. "Typical" is 5.6 MB (320x240 images), "large" is 21.9 MB (640x480 images). Reproduce the Rust numbers with `cargo test --release --test perf -- --ignored --nocapture` (set `JULIEPDF_PERF_FIXTURES=<dir>` to write the PDFs out).

| Budget | Result | Status |
|---|---|---|
| Installer < 15 MB | NSIS 4.09 MiB (MSI 4.93 MiB, exe 7.7 MiB) | met |
| Window visible < 1 s | 27–43 ms from spawn to visible top-level window (138–234 ms on a cold first launch) | met |
| First page of a 50-page PDF < 300 ms | open_pdf request → page 1 canvas on screen: typical 99–192 ms (was 238–275), large 212–226 ms (was 444–466) | met |
| Save ~100 annotations < 200 ms | 100 pen strokes of 150 points, `save_to_path` incl. fsync + rename: typical 58 ms, large 98 ms (was 108 ms); `write_incremental` alone 41 / 54 ms (was 66 ms on large) | met |
| Scroll/zoom 60 fps, pen stroke within one frame | not measurable headless; see manual checks | manual |
| Idle RAM with one PDF < 200 MB | Task Manager "private working set" summed over juliepdf.exe and its WebView2 processes: no PDF 173–177 MB; typical PDF just opened 368–377 MB (was ~430 MB; fix round: 351–365 MB, 379 MB re-measured with the 192 MB cache); large just opened 394–408 MB (was 494–558 MB); typical PDF after scrolling through all 50 pages 478–482 MB (539–547 MB with the earlier 192 MB render cache) | **not met at 2.5x DPI** |

What changed:
- Page canvases are no longer copied. pdf.js renders into a canvas, the page shows that canvas, and the render cache keeps the same element. Before, each page used three buffers (the render canvas, an ImageBitmap and the canvas it was drawn into).
- The render cache is limited by bytes, not by entry count. Storing a page at one scale drops that page's other scales. Freed canvases are shrunk to 0x0.
- Render cache budget (fix round): 64 MB for the pages kept off screen, down from 192 MB in total. Canvases in the DOM (the visible pages plus 1 page of overscan) are pinned: never evicted and always counted, so a page on screen can no longer drop out of the accounting. 64 MB is the smallest round budget that still holds one fit-width A4 page at 2.5x (50 MB), so together with the overscan page, scrolling back two pages stays instant; on a 1x–1.5x display it holds about 3–8 pages. Measured in the release build after scrolling the typical deck from page 1 to page 50 (driven over the WebView2 DevTools protocol: half a viewport every 250 ms) and 15–25 s idle, two runs each: 478–482 MB, against 539–547 MB with the 192 MB cache (GPU process 376 MB instead of 433–439 MB). Overscan and render resolution are unchanged.
- pdf.js renders on the GPU (`enableHWA: true`). Page 1 at 2964x4195 px paints in about 75 ms instead of about 150 ms, and the GPU process uses about 60 MB less. On a GPU reset the canvas' `contextlost` is cancelled (so the 2D context can be restored), and a canvas that comes back blank (`contextrestored`) is rendered again.
- One pdf.js worker is shared by all documents and started right after the first paint, which takes about 50 ms off every open. A failed warm-up is logged and the next open starts a new worker. The file bytes are handed to the worker without a copy.
- `page.cleanup()` runs when a page unmounts (it frees the page's operator lists and page-level objects; document-level fonts stay). A change of devicePixelRatio is watched and triggers a re-render.
- The eraser only publishes its hidden set when it has grown, not on every move.
- Appearance streams are Flate-compressed at the fast level instead of the best level: about 25 ms less per 100 strokes.

Remaining gaps:
- **Idle RAM.** An empty WebView2 window already takes about 175 MB on this machine, about 100 MB of it in the GPU process. At 2.5x DPI one fit-width A4 page is 2964x4195 px, which is 50 MB of pixels. With 2 pages mounted (the visible page plus 1 page of overscan, 95 MB of pixels), memory comes to about 370–380 MB right after opening, and to about 480 MB after scrolling through the deck (one 50 MB page cached off screen, plus GPU-process overhead that stays after the scroll). Dropping the off-screen cache entirely would save roughly another 50–60 MB but makes scrolling back two pages re-render. Ways to get under 200 MB, all trade-offs for the user to choose: cap the render resolution (for example at about 8 MP per page, which makes text slightly soft at 2.5x), drop the overscan (blank pages while scrolling), or render visible tiles instead of whole pages (a larger change). On a 1x–1.5x display the page bitmaps are 4–6x smaller.
- **First page of very large files.** For the 22 MB file, about 130 ms of the 220 ms goes into moving the whole file through Tauri IPC (`open_pdf`). Above roughly 30 MB the 300 ms budget will be missed. Fix: let pdf.js load from a custom URI-scheme protocol with HTTP Range support (`disableStream`, ranged loading), so page 1 only needs the bytes it uses.
- Not done (justified): throttling the select tool's hover hit-test to rAF. Chromium already aligns pointermove to animation frames, and a rAF delay could send a quick press to the wrong layer. Re-fitting width after all page sizes load: a layout behaviour, not a performance issue, and moot for uniform lecture decks. Touch pinch zoom: not trivial.
