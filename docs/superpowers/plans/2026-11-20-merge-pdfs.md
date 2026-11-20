# Merge PDFs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Merge page in the Document Builder (and on the start screen) that combines 2+ PDFs into a new file and opens it.

**Architecture:** Rust `pdf/merge.rs` merges whole files with lopdf (first file is the base, others renumbered, pages flattened and appended, unreachable objects pruned) behind a `merge_pdfs` command that writes atomically. The UI keeps a `MergeList` (pure helpers + a small reactive class) and a `MergePage.svelte`; file drops are redirected to it while it is shown.

**Tech Stack:** Rust + lopdf 0.47, Tauri 2, Svelte 5, TypeScript, vitest, pdf.js.

**Spec:** `docs/superpowers/specs/2026-11-20-merge-pdfs-design.md`

## Global Constraints

- Nothing in the viewer/session render or save paths changes.
- Row thumbnails: page 1 only, ~64 px; pdf.js documents destroyed after reading; at most 2 loads at once.
- Commits: conventional subjects, user identity only, no Claude trailer.
- Every change has tests (vitest / cargo).

## Review Focus

- The same file listed twice → merged twice, no object-id clash (Rust test `same_file_twice`).
- Input with nested `/Pages` nodes holding inherited MediaBox/Rotate/Resources → appended pages keep their look (`appended_pages_keep_inherited_attributes`).
- Input saved with xref streams / object streams → merges (`xref_stream_input`).
- Merge target equal to one of the inputs → still correct: all inputs are read before the atomic write (`target_may_be_an_input`).
- A dirty open tab listed → merge refused with a save offer (`blockers` helper test).

---

### Task 1: Rust merge + command

**Files:**
- Create: `src-tauri/src/pdf/merge.rs`; Test: `src-tauri/tests/merge.rs`
- Modify: `src-tauri/src/pdf/mod.rs` (add `pub mod merge;`), `src-tauri/src/pdf/writer.rs` (make `flattened_page`, `page_rotation` `pub(crate)`), `src-tauri/src/commands/files.rs` (extract `write_atomic`, add `merge_pdfs`), `src-tauri/src/lib.rs` (register)

**Interfaces:**
- Produces: `pub fn merge_documents(files: &[Vec<u8>]) -> Result<Vec<u8>, AppError>` (errors on < 2 files); `pub fn merge_to_path(sources: &[&Path], target: &Path) -> Result<(), AppError>` (prefixes load errors with the file name); Tauri command `merge_pdfs(paths: Vec<String>, target_path: String) -> Result<(), AppError>`.

- [ ] Tests in `tests/merge.rs` (using `fixtures`): `page_order_and_count` (simple_pdf(2)+simple_pdf(3) → 5 pages, page texts "Page 1,2,1,2,3"), `appended_pages_keep_inherited_attributes` (nested_pages_pdf second → appended pages have own MediaBox [0 0 400 600], Rotate 90, Resources), `annotations_survive` (pdf_with_foreign_annots second → read_annotations finds them on shifted page indices), `form_fields_are_merged` (fixture with AcroForm Fields in both → merged catalog AcroForm has both), `xref_stream_input`, `same_file_twice`, `encrypted_input_refused` (Encrypted), `fewer_than_two_files_refused`, `target_may_be_an_input`.
- [ ] Run `cargo test --test merge` → fail (no module).
- [ ] Implement: renumber each further doc with `renumber_objects_with(base.max_id + 1)`, move its objects into the base, replace each leaf page by `flattened_page(doc, id, base_root, page_rotation(doc, id))`, push to root `Kids`, bump `Count`; append `/AcroForm /Fields`; `prune_objects()`; remove trailer `Prev`/`XRefStm`; `save_to`.
- [ ] `cargo test`, `cargo clippy --all-targets` pass; commit `feat: merge PDF files in the backend`.

### Task 2: Merge list logic + drop redirection

**Files:**
- Create: `src/builder/merge/mergeList.ts`; Test: `tests/builder/mergeList.test.ts`
- Modify: `src/app/fileOpening.ts` (export `openFiles(paths)`, add `setDropTarget(fn | null)`), `src/core/ipc/api.ts` (`mergePdfs(paths, targetPath)`); Test: `tests/app/fileOpening.test.ts`

**Interfaces:**
- Produces: `interface MergeItem { id: number; path: string; name: string; pages: number | null; error: string | null }`; pure `moveItem(items, from, to)`, `totalPages(items)`, `readyToMerge(items)` (≥2, all loaded, no errors), `mergedName(firstPath)` → `<dir>\<stem> merged.pdf`, `dropIndex(y, rowTops: number[], rowHeight)`, `blockers(paths, openDirty: (p)=>boolean)`; `setDropTarget(fn: ((paths: string[]) => void) | null)`.
- [ ] Tests for each helper with concrete values (e.g. `mergedName('C:\\a\\Report.pdf') === 'C:\\a\\Report merged.pdf'`; `moveItem([a,b,c],0,2) → [b,c,a]`; drops with a target set go to it, PDFs only, not to `open`).
- [ ] Implement; `npx vitest run` passes; commit `feat: merge list helpers and drop redirection`.

### Task 3: Merge page UI and wiring

**Files:**
- Create: `src/builder/merge/MergePage.svelte`, `src/builder/merge/mergeFiles.svelte.ts` (reactive `MergeFiles` class: `add(paths)`, `remove(id)`, `move(from,to)`, info loading via `openPdf`+`loadPdf`, queue of 2, thumbnail canvas per item, `dispose()`), `src/builder/BuilderTabs.svelte`
- Modify: `src/builder/DocumentBuilder.svelte` (header tabs, body switch, `MergeFiles` kept across switches), `src/App.svelte` (standalone merge screen from start screen; open result), `src/app/EmptyState.svelte` ("Merge PDFs" link)
- Test: `tests/app/EmptyState.test.ts` (link calls `onMerge`)

**Interfaces:**
- Consumes: Task 1 command via `mergePdfs`; Task 2 helpers and `setDropTarget`, `openFiles`.
- [ ] MergePage: rows (handle, thumb, name, pages or error, ×), pointer-drag reorder via `dropIndex`, Alt+↑/↓; footer: Add PDFs…, total pages, Merge… (disabled unless `readyToMerge`). Merge flow: `blockers` → toast with "Save" action; save dialog (default `mergedName`), refuse target open in a tab; `mergePdfs`; `openFiles([target])`; close page.
- [ ] `npm run check`, `npx vitest run` pass; run the app and merge two files by hand; commit `feat: merge page in the document builder`.
