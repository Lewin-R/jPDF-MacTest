import type { Command } from '../../core/session/history.svelte'
import type { Annotation, Quad, TextMarkupAnnotation } from '../../core/session/model'
import { addAnnotations, compositeCommand, mergeAnnotations } from '../../core/session/commands'
import { findMergeableTextMarkup, mergeHighlightQuads } from '../../core/geometry/merge'
import { rectsToQuads, type ScreenRect } from '../../core/geometry/quads'
import { textLayers, type TextLayerPage } from '../../core/viewer/textLayers'

/**
 * Text markup tools (marker text mode, underline, strike-out): the native
 * selection on the text layers is turned into annotations on pointerup.
 * Tools that preview their result (underline, strike-out) also rebuild it
 * while the selection is dragged out, at most once per frame.
 */

/**
 * Client rects of the selected text inside `root` (text nodes only, so no
 * element boxes). Visits only the text nodes from the range's start to its
 * end, not the whole layer: previews run this every frame of a drag.
 */
function selectedTextRects(range: Range, root: Element): ScreenRect[] {
  const out: ScreenRect[] = []
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const start = range.startContainer
  let n: Node | null
  if (start !== root && root.contains(start)) {
    walker.currentNode = start
    n = start.nodeType === Node.TEXT_NODE ? start : walker.nextNode()
  } else {
    n = walker.nextNode()
  }
  for (; n; n = walker.nextNode()) {
    // Text nodes after the range's end: none of the rest is selected.
    if (range.comparePoint(n, 0) > 0) break
    if (!range.intersectsNode(n)) continue
    const part = root.ownerDocument.createRange()
    part.selectNodeContents(n)
    if (n === range.startContainer) part.setStart(n, range.startOffset)
    if (n === range.endContainer) part.setEnd(n, range.endOffset)
    out.push(...Array.from(part.getClientRects()))
  }
  return out
}

/** The native selection, or any ranges (e.g. one built from caret positions). */
export type Ranges = Pick<Selection, 'rangeCount' | 'getRangeAt'>

/**
 * One annotation per text layer (page) the selection touches, built by `make`
 * from that page's merged quads. Pages whose selected text yields no quad are skipped.
 */
export function markupFromSelection<T extends TextMarkupAnnotation>(
  sel: Ranges,
  make: (page: number, quads: Quad[]) => T,
  layers: Iterable<[Element, TextLayerPage]> = textLayers(),
): T[] {
  const out: T[] = []
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

/** A non-empty selection, or null. */
function currentSelection(): Selection | null {
  const sel = window.getSelection()
  return sel && !sel.isCollapsed && sel.rangeCount > 0 ? sel : null
}

/**
 * Calls `commit` with the native selection when a pointer is released after
 * a left-button press inside a text layer (the overlay does not see that
 * pointerup: it lets input through to the text layer). The selection is
 * cleared when `commit` returns true. Returns the detach function.
 *
 * With `preview`, it is called while that gesture changes the selection
 * (batched to one call per animation frame, null for an empty selection)
 * and with null when the gesture ends or the listener is detached.
 */
export function listenForTextSelection(
  commit: (sel: Selection) => boolean,
  preview?: (sel: Selection | null) => void,
): () => void {
  // Only a selection dragged out inside a text layer counts: Ctrl+A followed by a
  // click on the toolbar must not mark the whole document.
  let startedInText = false
  let frame: number | null = null
  let previewing = false

  function stopPreview() {
    if (frame !== null) cancelAnimationFrame(frame)
    frame = null
    if (previewing) preview?.(null)
    previewing = false
  }
  function onSelectionChange() {
    if (!startedInText || frame !== null) return
    frame = requestAnimationFrame(() => {
      frame = null
      if (!startedInText) return
      previewing = true
      preview!(currentSelection())
    })
  }
  function onPointerDown(e: PointerEvent) {
    const t = e.target
    stopPreview()
    // Right-button presses (temporary eraser) never select text.
    startedInText = e.button === 0 && t instanceof Node && [...textLayers()].some(([el]) => el.contains(t))
  }
  function onPointerUp() {
    const fromText = startedInText
    startedInText = false
    stopPreview()
    if (!fromText) return
    const sel = currentSelection()
    if (sel && commit(sel)) sel.removeAllRanges()
  }
  function onPointerCancel() {
    startedInText = false
    stopPreview()
  }
  window.addEventListener('pointerdown', onPointerDown, true)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', onPointerCancel)
  if (preview) document.addEventListener('selectionchange', onSelectionChange)
  return () => {
    startedInText = false
    stopPreview()
    window.removeEventListener('pointerdown', onPointerDown, true)
    window.removeEventListener('pointerup', onPointerUp)
    window.removeEventListener('pointercancel', onPointerCancel)
    if (preview) document.removeEventListener('selectionchange', onSelectionChange)
  }
}

interface PageSource {
  byPage(page: number): Annotation[]
}

/**
 * Commit of new text markup (one per page): each is merged into the
 * overlapping markup of the same style on its page (quads joined per line,
 * the oldest surviving), else added. One undo step for all of them.
 */
export function textMarkupCommand<T extends TextMarkupAnnotation>(store: PageSource, fresh: T[]): Command {
  const added: T[] = []
  const merges: Command[] = []
  for (const m of fresh) {
    const found = findMergeableTextMarkup(store.byPage(m.page), m)
    if (found.length === 0) {
      added.push(m)
      continue
    }
    const [oldest, ...rest] = found
    const quads = mergeHighlightQuads([...oldest.quads, ...rest.flatMap((a) => a.quads), ...m.quads])
    merges.push(mergeAnnotations(oldest, { ...oldest, quads, modifiedAt: m.modifiedAt }, rest))
  }
  if (merges.length === 0) return addAnnotations(added)
  return compositeCommand('Add annotation', added.length > 0 ? [addAnnotations(added), ...merges] : merges)
}
