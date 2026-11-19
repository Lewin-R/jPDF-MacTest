import type { Command } from '../../core/session/history.svelte'
import type { Annotation, HighlightAnnotation, InkAnnotation } from '../../core/session/model'
import { addAnnotations, compositeCommand, mergeAnnotations } from '../../core/session/commands'
import {
  findMergeableHighlights,
  findMergeableMarkerStrokes,
  mergeHighlightQuads,
} from '../../core/geometry/merge'

interface PageSource {
  byPage(page: number): Annotation[]
}

/**
 * Folds `fresh` into the mergeable annotations `found` (z-order): the oldest
 * (lowest) survives as `combine(oldest, rest)`. Null when nothing merges.
 */
function mergeInto<T extends Annotation>(found: T[], combine: (oldest: T, rest: T[]) => T): Command | null {
  if (found.length === 0) return null
  const [oldest, ...rest] = found
  return mergeAnnotations(oldest, combine(oldest, rest), rest)
}

/** Commit of a new marker stroke: merged into overlapping marker ink of the same style, else added. */
export function markerStrokeCommand(store: PageSource, fresh: InkAnnotation): Command {
  const found = findMergeableMarkerStrokes(store.byPage(fresh.page), fresh)
  return (
    mergeInto(found, (oldest, rest) => ({
      ...oldest,
      strokes: [...oldest.strokes, ...rest.flatMap((a) => a.strokes), ...fresh.strokes],
      modifiedAt: fresh.modifiedAt,
    })) ?? addAnnotations([fresh])
  )
}

/**
 * Commit of new text highlights (one per page): each is merged into the
 * overlapping highlights of the same colour and opacity on its page (quads
 * joined per line), else added. One undo step for all of them.
 */
export function highlightsCommand(store: PageSource, fresh: HighlightAnnotation[]): Command {
  const added: HighlightAnnotation[] = []
  const merges: Command[] = []
  for (const h of fresh) {
    const found = findMergeableHighlights(store.byPage(h.page), h)
    const merge = mergeInto(found, (oldest, rest) => ({
      ...oldest,
      quads: mergeHighlightQuads([...oldest.quads, ...rest.flatMap((a) => a.quads), ...h.quads]),
      modifiedAt: h.modifiedAt,
    }))
    if (merge) merges.push(merge)
    else added.push(h)
  }
  if (merges.length === 0) return addAnnotations(added)
  return compositeCommand('Add annotation', added.length > 0 ? [addAnnotations(added), ...merges] : merges)
}
