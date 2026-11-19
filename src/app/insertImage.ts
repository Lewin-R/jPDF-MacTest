import { encodePng, type PngEncoder, type RgbaImage } from '../annotations/image/encode'
import { placeImage, type PlacementViewport } from '../annotations/image/placement'
import { addAnnotations } from '../core/session/commands'
import type { Command } from '../core/session/history.svelte'
import { newId, type ImageAnnotation, type Point } from '../core/session/model'

/** The document an image is pasted into (a DocumentSession). */
export interface ImageTarget {
  commitPendingEdit(): void
  history: { execute(cmd: Command): void }
}

/**
 * Pastes `img` onto page `page` (0-based) of `target`: its top-left corner at
 * `at` (PDF space), sized and kept on the page by `placeImage` for the page's
 * viewport `vp`. One undo step. Returns the added annotation.
 */
export async function insertImage(
  target: ImageTarget,
  page: number,
  at: Point,
  vp: PlacementViewport,
  img: RgbaImage,
  author: string,
  encoder?: PngEncoder,
): Promise<ImageAnnotation> {
  const image = await encodePng(img, encoder)
  const a: ImageAnnotation = {
    id: newId(),
    page,
    sourceRef: null,
    modifiedAt: new Date().toISOString(),
    author,
    kind: 'image',
    rect: placeImage(img, at, vp),
    image,
  }
  target.commitPendingEdit()
  target.history.execute(addAnnotations([a]))
  return a
}
