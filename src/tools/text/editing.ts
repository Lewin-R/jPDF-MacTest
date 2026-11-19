import type { TextEdit, ToolContext } from '../../core/registry/tools'
import { addAnnotations, deleteAnnotations, updateAnnotation } from '../../core/session/commands'
import type { FreeTextAnnotation, Point } from '../../core/session/model'
import { boxHeight, frameOrigin, frameSize, layoutLines, pageBoxRect } from '../../core/geometry/textLayout'

/**
 * `base` with `text`, its lines wrapped to the box's on-screen width and the
 * height fitted to them; the box keeps its on-screen top-left corner and width.
 */
export function layoutFreeText(base: FreeTextAnnotation, text: string, rotation: number): FreeTextAnnotation {
  return resizeFreeText({ ...base, text }, frameOrigin(base.rect, rotation), frameSize(base.rect, rotation).width, rotation)
}

/**
 * `base` with its on-screen top-left corner at `origin` (PDF) and `width` wide
 * on screen: lines re-wrapped to the width, height fitted to the lines.
 */
export function resizeFreeText(
  base: FreeTextAnnotation,
  origin: Point,
  width: number,
  rotation: number,
): FreeTextAnnotation {
  const lines = layoutLines(base.text, base.fontSize, width)
  const rect = pageBoxRect(origin, width, boxHeight(lines.length, base.fontSize), rotation)
  return { ...base, lines, rect, modifiedAt: new Date().toISOString() }
}

export interface TextEditing {
  /** Opens the editor for `draft` (a new box when isNew, else the stored one, hidden while editing). */
  begin(draft: FreeTextAnnotation, isNew: boolean, rotation: number): void
  /** Closes the open editor, if any, committing it: a new box is added (discarded if blank), an edited one updated (deleted if blank). */
  commit(): void
  readonly isOpen: boolean
}

/** The text box editing state shared by the Text and Select tools. */
export function createTextEditing(ctx: ToolContext): TextEditing {
  let open: { draft: FreeTextAnnotation; isNew: boolean; rotation: number; text: string } | null = null

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
    commit()
    const o = { draft, isNew, rotation, text: draft.text }
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

  return {
    begin,
    commit,
    get isOpen() {
      return open !== null
    },
  }
}
