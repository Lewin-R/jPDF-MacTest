import type { AnnotationKind } from '../../core/registry/annotationKinds'
import type { TextLineAnnotation } from '../../core/session/model'
import { nearQuads, quadsBounds, translateQuads } from '../quadMarkup'
import Render from './Render.svelte'

/**
 * Underline / strike-out. Like highlights, the whole line box hits (so the
 * text can be clicked or erased anywhere, not only on the thin line).
 */
function textLineKind(kind: TextLineAnnotation['kind']): AnnotationKind<TextLineAnnotation> {
  return {
    kind,
    Render,
    bounds: (a) => quadsBounds(a.quads),
    hitTest: (a, p, tolerancePt) => nearQuads(a.quads, p, tolerancePt),
    translate: (a, dx, dy) => ({ ...a, quads: translateQuads(a.quads, dx, dy) }),
  }
}

export const underlineKind = textLineKind('underline')
export const strikeoutKind = textLineKind('strikeout')
