import type { AnnotationKind } from '../../core/registry/annotationKinds'
import type { HighlightAnnotation } from '../../core/session/model'
import { nearQuads, quadsBounds, translateQuads } from '../quadMarkup'
import Render from './Render.svelte'

export const highlightKind: AnnotationKind<HighlightAnnotation> = {
  kind: 'highlight',
  Render,
  bounds: (a) => quadsBounds(a.quads),
  hitTest: (a, p, tolerancePt) => nearQuads(a.quads, p, tolerancePt),
  translate: (a, dx, dy) => ({ ...a, quads: translateQuads(a.quads, dx, dy) }),
}
