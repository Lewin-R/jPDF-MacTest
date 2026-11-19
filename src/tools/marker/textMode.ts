import type { HighlightAnnotation, Quad } from '../../core/session/model'
import { newId } from '../../core/session/model'
import { addAnnotations } from '../../core/session/commands'
import { rectsToQuads, type ScreenRect } from '../../core/geometry/quads'
import type { ToolContext } from '../../core/registry/tools'
import { textLayers, type TextLayerPage } from '../../core/viewer/textLayers'
import { settings as appSettings } from '../../core/settings/settings.svelte'
import { toasts } from '../../ui/toasts.svelte'
import type { MarkerSettings } from './settings'

export const FALLBACK_HINT = 'markerFallback'
export const FALLBACK_MESSAGE = 'No selectable text on this page — using freehand marker'

/** Client rects of the selected text inside `root` (text nodes only, so no element boxes). */
function selectedTextRects(range: Range, root: Element): ScreenRect[] {
  const out: ScreenRect[] = []
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!range.intersectsNode(n)) continue
    const part = root.ownerDocument.createRange()
    part.selectNodeContents(n)
    if (n === range.startContainer) part.setStart(n, range.startOffset)
    if (n === range.endContainer) part.setEnd(n, range.endOffset)
    out.push(...Array.from(part.getClientRects()))
  }
  return out
}

/**
 * One highlight per text layer (page) the selection touches, built by `make`
 * from that page's merged quads. Pages whose selected text yields no quad are skipped.
 */
export function highlightsFromSelection(
  sel: Selection,
  make: (page: number, quads: Quad[]) => HighlightAnnotation,
  layers: Iterable<[Element, TextLayerPage]> = textLayers(),
): HighlightAnnotation[] {
  const out: HighlightAnnotation[] = []
  for (const [el, info] of layers) {
    const rects: ScreenRect[] = []
    for (let i = 0; i < sel.rangeCount; i++) {
      const range = sel.getRangeAt(i)
      if (range.intersectsNode(el)) rects.push(...selectedTextRects(range, el))
    }
    const quads = rectsToQuads(rects, info.toPdf)
    if (quads.length > 0) out.push(make(info.page, quads))
  }
  return out.sort((a, b) => a.page - b.page)
}

/**
 * Commits the native text selection as highlights when a pointer is released
 * while the marker is in text mode (the overlay does not see that pointerup:
 * it lets input through to the text layer). Returns the detach function.
 */
export function listenForTextSelection(ctx: ToolContext, settings: () => MarkerSettings): () => void {
  // Only a selection dragged out inside a text layer counts: Ctrl+A followed by a
  // click on the toolbar must not highlight the whole document.
  let startedInText = false
  function onPointerDown(e: PointerEvent) {
    const t = e.target
    // Right-button presses (temporary eraser) never select text.
    startedInText = e.button === 0 && t instanceof Node && [...textLayers()].some(([el]) => el.contains(t))
  }
  function onPointerUp() {
    const fromText = startedInText
    startedInText = false
    const s = settings()
    if (s.mode !== 'text' || !fromText) return
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return
    const modifiedAt = new Date().toISOString()
    const highlights = highlightsFromSelection(sel, (page, quads) => ({
      id: newId(),
      page,
      sourceRef: null,
      modifiedAt,
      author: appSettings.data.author,
      kind: 'highlight',
      quads,
      color: s.color,
      opacity: s.opacity,
    }))
    if (highlights.length === 0) return
    ctx.execute(addAnnotations(highlights))
    sel.removeAllRanges()
  }
  window.addEventListener('pointerdown', onPointerDown, true)
  window.addEventListener('pointerup', onPointerUp)
  return () => {
    window.removeEventListener('pointerdown', onPointerDown, true)
    window.removeEventListener('pointerup', onPointerUp)
  }
}

/** Text mode on a page without text: tells the user once ever that freehand is used instead. */
export function noteFreehandFallback(): void {
  if (appSettings.data.hints[FALLBACK_HINT]) return
  toasts.show(FALLBACK_MESSAGE)
  appSettings.setHint(FALLBACK_HINT)
}
