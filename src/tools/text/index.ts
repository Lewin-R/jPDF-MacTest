import type { PagePointerEvent, ToolContext, ToolDefinition, ToolHandler } from '../../core/registry/tools'
import { annotationKinds } from '../../core/registry/annotationKinds'
import type { FreeTextAnnotation, Point } from '../../core/session/model'
import { newId } from '../../core/session/model'
import { settings as appSettings } from '../../core/settings/settings.svelte'
import { boxHeight, DEFAULT_BOX_WIDTH, normalizeRotation, pageBoxRect } from '../../core/geometry/textLayout'
import { createTextEditing, layoutFreeText } from './editing'
import Icon from './Icon.svelte'
import Options from './Options.svelte'
import type { TextSettings } from './settings'

export { layoutFreeText, type TextSettings }

/** Screen pixels around a box that still count as clicking it. */
const HIT_TOLERANCE_PX = 4

/**
 * Click on a page: opens the editor for the topmost text box under the
 * pointer, or for a new box with its top-left corner at the click. A click
 * while a box is open only closes it. Closing commits: a new box is added
 * (discarded if blank), an edited one updated (deleted if blank).
 */
export function createTextHandler(ctx: ToolContext, settings: () => TextSettings): ToolHandler {
  const editing = createTextEditing(ctx)
  let press: { pdf: Point; closedEdit: boolean } | null = null

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
      const closedEdit = editing.isOpen
      editing.commit()
      press = { pdf: e.pdf, closedEdit }
    },
    // Opened on release: the press's own focus change (mousedown) is over by then.
    onPointerUp(e) {
      const p = press
      press = null
      if (!p || p.closedEdit || editing.isOpen) return
      const rotation = normalizeRotation(e.vp.rotation)
      const hit = boxAt(e, p.pdf)
      if (hit) editing.begin(hit, false, rotation)
      else editing.begin(newBox(e.page, p.pdf, rotation), true, rotation)
    },
    onPointerCancel() {
      press = null
    },
    onDeactivate() {
      press = null
      editing.commit()
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
