import type { PageViewport } from 'pdfjs-dist'
import type { Component } from 'svelte'
import type { Command } from '../session/history.svelte'
import type { Annotation, FreeTextAnnotation, Point, RGB } from '../session/model'
import type { DocumentSession } from '../session/session.svelte'

/** A mounted page: its viewport and its top-left corner in client px. */
export interface PageFrame {
  vp: PageViewport
  origin: Point
}

export interface PagePointerEvent {
  /** 0-based, matches Annotation.page */
  page: number
  pdf: Point
  screen: Point
  vp: PageViewport
  native: PointerEvent
  /** Maps client coordinates (e.g. of coalesced events) to PDF user space, as `pdf` was. */
  toPdf(clientX: number, clientY: number): Point
}

export interface ToolHandler {
  onPointerDown?(e: PagePointerEvent): void
  onPointerMove?(e: PagePointerEvent): void
  onPointerUp?(e: PagePointerEvent): void
  /** The gesture was aborted (pointercancel, lost capture, page unmounted): discard it, do not commit. */
  onPointerCancel?(e: PagePointerEvent): void
  onKeyDown?(e: KeyboardEvent): boolean
  onDeactivate?(): void
  /**
   * Non-null while the tool selects text natively (marker text mode): on pages
   * that have text, the overlay lets pointer input through to the text layer,
   * whose selection is tinted with `color`; the handler then receives pointer
   * input only on pages without text. Read reactively by the viewer.
   */
  textSelection?(): { color: RGB } | null
  /**
   * Hover-based text pass-through (select tool): whether pointer input at `e`
   * should go through to the text layer because nothing of the tool's is
   * there. Evaluated as the pointer hovers a page that has (or may have) text,
   * while no button is pressed; a press where it returned true goes to the
   * text layer (native text selection) and is reported via onPassThroughDown
   * instead of onPointerDown.
   */
  passThroughAt?(e: PagePointerEvent): boolean
  /** A press that passThroughAt let through to the text layer (e.g. deselect). */
  onPassThroughDown?(e: PagePointerEvent): void
}

/**
 * An open text box editor (Overlay draws it as a <textarea> on `draft.page`).
 * The editor reports every change through setText and ends editing with
 * commit (Escape, blur, unmount); commit is idempotent.
 */
export interface TextEdit {
  /** The box being edited: position, size and style; `text` is the initial text. */
  draft: FreeTextAnnotation
  /** /Rotate of the box's page (the editor is laid out upright on screen). */
  rotation: number
  setText(text: string): void
  commit(): void
}

export interface ToolContext {
  session: DocumentSession
  execute(c: Command): void
  selection: { ids: string[]; set(ids: string[]): void }
  /** Live, uncommitted annotation drawn by Overlay. */
  preview: { set(a: Annotation | null): void }
  /** Annotations hidden by Overlay while a gesture (e.g. erasing) is in progress; cleared when the tool changes. */
  hidden: { readonly ids: ReadonlySet<string>; set(ids: Iterable<string>): void }
  /** Overrides the tool's cursor (e.g. 'grabbing' during a drag); null restores it. */
  cursor: { set(c: string | null): void }
  /** Opens (or with null closes) the text box editor; cleared when the tool changes. */
  textEdit: { set(e: TextEdit | null): void }
  /** Frames of the pages currently mounted (0-based); null for others. */
  pages?: { frame(page: number): PageFrame | null }
  /**
   * A drag that may carry an element across pages, started on `page`, the
   * element now on `at`: the viewer keeps both pages mounted and auto-scrolls
   * near its edges; null ends it.
   */
  crossDrag?: { set(d: { page: number; at?: number } | null): void }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface ToolDefinition<S = any> {
  type: string
  displayName: string
  description: string
  shortcut?: string // single letter
  Icon: Component<{ settings: S; size: number }>
  defaultSettings: S
  Options: Component<{ settings: S; update(patch: Partial<S>): void }> | null
  /**
   * Shown in the tool's flyout instead of Options while an annotation is
   * selected: edits it, `update` committing one undo step per call.
   */
  SelectionOptions?: Component<{ annotation: Annotation; update(after: Annotation): void }>
  cursor?(settings: S): string
  allowMultipleInstances: boolean
  createHandler(ctx: ToolContext, settings: () => S): ToolHandler
}

export interface ToolRegistry {
  register(d: ToolDefinition): void
  get(type: string): ToolDefinition
  list(): ToolDefinition[]
}

export function createToolRegistry(): ToolRegistry {
  const tools = new Map<string, ToolDefinition>()
  return {
    register(d) {
      if (tools.has(d.type)) throw new Error(`Tool already registered: ${d.type}`)
      tools.set(d.type, d)
    },
    get(type) {
      const d = tools.get(type)
      if (!d) throw new Error(`Unknown tool: ${type}`)
      return d
    },
    list: () => [...tools.values()],
  }
}

export const toolRegistry: ToolRegistry = createToolRegistry()
