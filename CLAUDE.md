# JuliePDF

Personal Windows desktop PDF annotator (Tauri 2 + Svelte 5 + TypeScript, Rust
backend with lopdf). Annotations are saved into the PDF as standard annotations
with appearance streams, so they must look right in every other viewer. Design:
`docs/superpowers/specs/2026-11-18-juliepdf-design.md`.

## Performance

Performance is a core goal: the app must stay fast, quick and responsive,
and feel lightweight. Keep work off the drawing and page-rendering paths.
If a proposed feature could noticeably slow the app or make it feel heavier,
say so (and suggest a lighter alternative) before implementing it.

## Commands

- Run the app: `npm.cmd run tauri dev` (PowerShell blocks `npm.ps1` on this
  setup; `npm.cmd` works without changing the execution policy).
- TS tests: `npx vitest run` · Types: `npm run check`
- Rust tests: `cargo test` in `src-tauri/` · Lint: `cargo clippy --all-targets`
- A fresh worktree has no `node_modules`: run `npm ci` there first (vitest
  cannot load the main checkout's modules).

## Layout

- `src/annotations/<kind>/`: one annotation kind each (Render.svelte + an
  `AnnotationKind`: bounds, hitTest, translate, scale), registered in
  `src/annotations/index.ts`.
- `src/tools/<tool>/`: one tool each (`ToolDefinition` + handler, Options),
  registered in `src/tools/index.ts`.
- `src/core/`: session/model (annotation types, identical JSON to the Rust
  DTO), registries, viewer, geometry.
- `src-tauri/src/pdf/`: `dto.rs` (mirrors `model.ts`), `reader.rs` (PDF →
  DTO), `writer.rs` (incremental save), `appearance.rs` (appearance streams).
- A new annotation kind touches both sides: `model.ts` + `dto.rs`, a TS kind,
  reader/writer/appearance, and a roundtrip test in `src-tauri/tests/roundtrip.rs`.

## Conventions

- Commits use the user's git identity only: no `Co-Authored-By: Claude`
  trailer or other Claude attribution in commits or PRs.
- Conventional commit subjects (`feat:`, `fix:`, `test:` …) with a short body
  explaining what changed and why.
- Comments explain intent and edge cases; keep the existing doc-comment style.
- Every feature or fix comes with tests (vitest for TS, cargo tests for Rust).
