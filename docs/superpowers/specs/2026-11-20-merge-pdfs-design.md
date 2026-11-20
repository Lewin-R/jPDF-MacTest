# Merge PDFs (Document Builder)

## Intent

The Document Builder can rearrange the pages of one document. Users also
need to combine several PDFs into one. Merging must stay in the spirit of the
app: elegant, fast, lightweight, and the result must open in every viewer.

## Goals / non-goals / anti-goals

- Goal: combine 2+ PDF files, in a chosen order, into a new PDF file, then
  keep working on it (it opens in a tab; the builder's *Pages* view does any
  page-level fine-tuning).
- Non-goal: picking individual pages of the inputs on the merge page (that is
  what *Pages* does after merging); inserting another file's pages into an
  open session.
- Anti-goal: anything that slows the viewer or the page builder. Merging
  must not touch the render or save paths of a session.

## Approaches

1. **Insert pages of another file into the open session.** Page entries
   would carry a file id, every session would juggle several pdf.js
   documents, the incremental writer would copy object graphs across
   files. Most flexible, but invasive and touches hot paths. Rejected.
2. **A separate Merge page that writes a new file** (picked). Self-contained:
   a file list in the UI and one Rust command. The merged file is an
   ordinary PDF the app opens like any other.

## Design (approved)

- **Entry points:** the builder header gets a *Pages | Merge* switch. The
  start screen gets a "Merge PDFs" link that opens the merge page without a
  document.
- **Merge page:** a vertical list of files. The open document is prefilled
  as the first entry. "Add PDFs…" (multi-select picker) or dropping files on
  the window adds entries (while the merge page is shown, drops go to the
  list instead of opening tabs). Rows: drag handle, small first-page
  thumbnail, file name, page count, remove (×). Reorder by dragging (pointer
  events; HTML5 drag-and-drop is unreliable in WebView2 with Tauri's file
  drop enabled) or Alt+↑/↓ on a focused row. The footer shows the total
  page count and the "Merge…" button.
- **Row info:** each added file is loaded with pdf.js for its page count and
  a ~64 px page-1 thumbnail, then the pdf.js document is destroyed (nothing
  stays in memory but a tiny canvas). Loads run two at a time. A file that
  fails to load shows its error on the row and blocks merging until removed.
- **Merging:** "Merge…" opens a save dialog (default `<first> merged.pdf`
  next to the first file). It refuses a target that is open in a tab. A
  listed file that is open in a tab with unsaved changes stops the merge
  with a toast offering to save it (the merge reads files from disk).
  Rust `merge_pdfs(paths, target)` runs off the UI thread, writes atomically
  (temp file + rename, like saving), and the result opens in a new tab.
- **Rust merge (`pdf/merge.rs`):** the first file is the base. Each further
  file is loaded, its objects renumbered above the base's, its leaf pages
  flattened (inherited MediaBox/CropBox/Resources/Rotate copied in) and
  appended to the base's root page tree. Their `/AcroForm /Fields` are
  appended to the base form so form fields keep working. Unreachable objects
  (the other files' catalogs, page trees, outlines) are pruned, and the
  result is written as a fresh full file. The base keeps its outline and
  document info. Annotations (incl. JuliePDF's) come along as page objects.
  Encrypted inputs are refused (`Encrypted`, naming the file).

## Left to the builder

Visual details follow the existing builder styling (tokens, footer actions).

## Tests

- Rust: page count/order, inherited attributes of nested page trees,
  rotation kept, annotations kept and readable, form fields merged, xref
  stream input, encrypted input refused, same file twice.
- TS: merge list helpers (add/remove/move, readiness, totals, default
  target name, drop index), drop redirection in file opening.
