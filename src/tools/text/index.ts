import type { PagePointerEvent, TextEdit, ToolContext, ToolDefinition, ToolHandler } from '../../core/registry/tools'
import { annotationKinds } from '../../core/registry/annotationKinds'
import { addAnnotations, deleteAnnotations, updateAnnotation } from '../../core/session/commands'
import type { FreeTextAnnotation, Point } from '../../core/session/model'
import { newId } from '../../core/session/model'
import { settings as appSettings } from '../../core/settings/settings.svelte'
import {
  boxHeight, DEFAULT_BOX_WIDTH, frameOrigin, frameSize, layoutLines, normalizeRotation, pageBoxRect,
} from '../../core/geometry/textLayout'
import Icon from './Icon.svelte'
import Options from './Options.svelte'
import type { TextSettings } from './settings'

export type { TextSettings }

/** Screen pixels around a box that still count as clicking it. */
const HIT_TOLERANCE_PX = 4

/**
 * `base` with `text`, its lines wrapped to the box's on-screen width and the
 * height fitted to them; the box keeps its on-screen top-left corner and width.
 */
export function layoutFreeText(base: FreeTextAnnotation, text: string, rotation: number): FreeTextAnnotation {
  const { width } = frameSize(base.rect, rotation)
  const lines = layoutLines(text, base.fontSize, width)
  const rect = pageBoxRect(frameOrigin(base.rect, rotation), width, boxHeight(lines.length, base.fontSize), rotation)
  return { ...base, text, lines, rect, modifiedAt: new Date().toISOString() }
}

interface OpenEdit {
  /** The box as opened (a new draft, or the saved annotation). */
  draft: FreeTextAnnotation
  isNew: boolean
  rotation: number
  text: string
}

/**
 * Click on a page: opens the editor for the topmost text box under the
 * pointer, or for a new box with its top-left corner at the click. A click
 * while a box is open only closes it. Closing commits: a new box is added
 * (discarded if blank), an edited one updated (deleted if blank).
 */
export function createTextHandler(ctx: ToolContext, settings: () => TextSettings): ToolHandler {
  let open: OpenEdit | null = null
  let press: { pdf: Point; closedEdit: boolean } | null = null

  function commit(): void {
    const o = open
    if (!o) return
    open = null
    ctx.textEdit.set(null)
    if (!o.isNew) ctx.hidden.set([])
    if (ctx.session.pendingEdit === commit) ctx.session.pendingEdit = null

    const blank = o.text.trim() === ''
    if (o.isNew) {
      if (!blank) ctx.execute(addAnnotations([layoutFreeText(o.draft, o.text, o.rotation)]))
      return
    }
    // The current version: it may have changed (e.g. saved) while editing.
    const current = ctx.session.store.get(o.draft.id)
    if (current?.kind !== 'freetext') return
    if (blank) ctx.execute(deleteAnnotations([current]))
    else if (o.text !== current.text) ctx.execute(updateAnnotation(current, layoutFreeText(current, o.text, o.rotation)))
  }

  function begin(draft: FreeTextAnnotation, isNew: boolean, rotation: number): void {
    const o: OpenEdit = { draft, isNew, rotation, text: draft.text }
    open = o
    const edit: TextEdit = {
      draft,
      rotation,
      setText: (t) => {
        o.text = t
      },
      // Idempotent: blur, Escape and unmount may all end the same edit.
      commit: () => {
        if (open === o) commit()
      },
    }
    if (!isNew) ctx.hidden.set([draft.id])
    ctx.textEdit.set(edit)
    ctx.session.pendingEdit = commit
  }

  function boxAt(e: PagePointerEvent, p: Point): FreeTextAnnotation | null {
    const tolerance = HIT_TOLERANCE_PX / e.vp.scale
    const onPage = ctx.session.store.byPage(e.page)
    for (let i = onPage.length - 1; i >= 0; i--) {
      const a = onPage[i]
      if (a.kind === 'freetext' && annotationKinds.get('freetext').hitTest(a, p, tolerance)) return a
    }
    return null
  }

  function newBox(page: number, origin: Point, rotation: number): FreeTextAnnotation {
    const s = settings()
    return {
      id: newId(),
      page,
      sourceRef: null,
      modifiedAt: new Date().toISOString(),
      author: appSettings.data.author,
      kind: 'freetext',
      rect: pageBoxRect(origin, DEFAULT_BOX_WIDTH, boxHeight(1, s.fontSize), rotation),
      text: '',
      lines: [''],
      fontSize: s.fontSize,
      textColor: s.textColor,
      background: s.background,
    }
  }

  return {
    onPointerDown(e) {
      const closedEdit = open !== null
      commit()
      press = { pdf: e.pdf, closedEdit }
    },
    // Opened on release: the press's own focus change (mousedown) is over by then.
    onPointerUp(e) {
      const p = press
      press = null
      if (!p || p.closedEdit || open) return
      const rotation = normalizeRotation(e.vp.rotation)
      const hit = boxAt(e, p.pdf)
      if (hit) begin(hit, false, rotation)
      else begin(newBox(e.page, p.pdf, rotation), true, rotation)
    },
    onPointerCancel() {
      press = null
    },
    onDeactivate() {
      press = null
      commit()
    },
  }
}

export const textTool: ToolDefinition<TextSettings> = {
  type: 'text',
  displayName: 'Text',
  description: 'Add a text box',
  shortcut: 'T',
  Icon,
  defaultSettings: { textColor: [0.1, 0.1, 0.1], fontSize: 12, background: null },
  Options,
  cursor: () => 'text',
  allowMultipleInstances: true,
  createHandler: createTextHandler,
}
