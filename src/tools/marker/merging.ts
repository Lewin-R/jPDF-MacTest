import type { Command } from '../../core/session/history.svelte'
import type { Annotation, HighlightAnnotation, InkAnnotation } from '../../core/session/model'
import { isEditable } from '../../core/session/model'
import { addAnnotations, mergeAnnotations } from '../../core/session/commands'
import { findMergeableMarkerStrokes } from '../../core/geometry/merge'
import { textMarkupCommand } from '../shared/textMarkup'

interface PageSource {
  byPage(page: number): Annotation[]
}

/** Commit of a new marker stroke: merged into overlapping marker ink of the same style, else added. */
export function markerStrokeCommand(store: PageSource, fresh: InkAnnotation): Command {
  const found = findMergeableMarkerStrokes(store.byPage(fresh.page).filter(isEditable), fresh)
  if (found.length === 0) return addAnnotations([fresh])
  const [oldest, ...rest] = found
  return mergeAnnotations(
    oldest,
    {
      ...oldest,
      strokes: [...oldest.strokes, ...rest.flatMap((a) => a.strokes), ...fresh.strokes],
      modifiedAt: fresh.modifiedAt,
    },
    rest,
  )
}

/**
 * Commit of new text highlights (one per page): overlapping highlights of the
 * same colour and opacity become one layer (no double darkening).
 */
export const highlightsCommand = (store: PageSource, fresh: HighlightAnnotation[]): Command =>
  textMarkupCommand(store, fresh)
