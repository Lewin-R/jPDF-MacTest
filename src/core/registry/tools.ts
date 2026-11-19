import type { PageViewport } from 'pdfjs-dist'
import type { Component } from 'svelte'
import type { Command } from '../session/history.svelte'
import type { Annotation, Point, RGB } from '../session/model'
import type { DocumentSession } from '../session/session.svelte'

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
