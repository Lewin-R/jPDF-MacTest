/**
 * Page selection of the document builder (pure helpers). A click toggles a
 * page; Shift+click adds every page between the previous click (the anchor)
 * and this one.
 */
export interface PageSelection {
  selected: ReadonlySet<number>
  /** The page last clicked; Shift+click selects from here. */
  anchor: number | null
}

export const emptySelection: PageSelection = { selected: new Set(), anchor: null }

export function clickPage(sel: PageSelection, i: number, shift: boolean): PageSelection {
  const next = new Set(sel.selected)
  if (shift && sel.anchor !== null) {
    const [from, to] = sel.anchor < i ? [sel.anchor, i] : [i, sel.anchor]
    for (let k = from; k <= to; k++) next.add(k)
  } else if (next.has(i)) {
    next.delete(i)
  } else {
    next.add(i)
  }
  return { selected: next, anchor: i }
}

export function selectAll(count: number): PageSelection {
  return { selected: new Set(Array.from({ length: count }, (_, i) => i)), anchor: null }
}

export function selectOnly(indices: readonly number[]): PageSelection {
  return { selected: new Set(indices), anchor: indices.length > 0 ? indices[indices.length - 1] : null }
}

/** The selection without pages past the end of a `count`-page list (after an undo removed pages). */
export function clampSelection(sel: PageSelection, count: number): PageSelection {
  if ([...sel.selected].every((i) => i < count) && (sel.anchor ?? 0) < count) return sel
  return {
    selected: new Set([...sel.selected].filter((i) => i < count)),
    anchor: sel.anchor !== null && sel.anchor < count ? sel.anchor : null,
  }
}

/** Selected pages in page order. */
export function sortedSelection(sel: PageSelection): number[] {
  return [...sel.selected].sort((a, b) => a - b)
}
