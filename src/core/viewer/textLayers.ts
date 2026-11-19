import type { Point } from '../session/model'

/** A rendered text layer: its page and how its client coordinates map to PDF space. */
export interface TextLayerPage {
  /** 0-based, matches Annotation.page. */
  page: number
  toPdf(clientX: number, clientY: number): Point
}

const layers = new Map<Element, TextLayerPage>()

/** Registers a mounted text layer element; returns the unregister function. */
export function registerTextLayer(el: Element, info: TextLayerPage): () => void {
  layers.set(el, info)
  return () => {
    if (layers.get(el) === info) layers.delete(el)
  }
}

/** Currently mounted text layers. */
export function textLayers(): Iterable<[Element, TextLayerPage]> {
  return layers.entries()
}
