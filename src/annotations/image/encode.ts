import type { ImageAnnotation } from '../../core/session/model'

/** Longest side (px) a pasted image is stored with; larger ones are downscaled. */
export const MAX_IMAGE_PX = 2000

/** Unpremultiplied 8-bit RGBA pixels, row by row. */
export interface RgbaImage {
  width: number
  height: number
  rgba: Uint8Array
}

/** Encodes `img` as a PNG of `width` x `height` pixels (scaled when that differs). */
export type PngEncoder = (img: RgbaImage, width: number, height: number) => Promise<Uint8Array>

/** `width` x `height` scaled down (keeping the aspect ratio) so the longest side is at most `max`. */
export function downscaledSize(width: number, height: number, max = MAX_IMAGE_PX): { width: number; height: number } {
  const k = Math.min(1, max / Math.max(width, height))
  if (k === 1) return { width, height }
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) }
}

export function bytesToBase64(bytes: Uint8Array): string {
  let s = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(s)
}

/** PNG encoder drawing through an OffscreenCanvas (smooth downscaling). */
export const canvasPngEncoder: PngEncoder = async (img, width, height) => {
  const pixels = new Uint8ClampedArray(img.rgba.buffer as ArrayBuffer, img.rgba.byteOffset, img.width * img.height * 4)
  const src = new OffscreenCanvas(img.width, img.height)
  src.getContext('2d')!.putImageData(new ImageData(pixels, img.width, img.height), 0, 0)
  let out = src
  if (width !== img.width || height !== img.height) {
    out = new OffscreenCanvas(width, height)
    const ctx = out.getContext('2d')!
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(src, 0, 0, width, height)
  }
  const blob = await out.convertToBlob({ type: 'image/png' })
  return new Uint8Array(await blob.arrayBuffer())
}

/** The PNG of `img` as stored in an image annotation, downscaled past `MAX_IMAGE_PX`. */
export async function encodePng(img: RgbaImage, encoder: PngEncoder = canvasPngEncoder): Promise<ImageAnnotation['image']> {
  const { width, height } = downscaledSize(img.width, img.height)
  const png = await encoder(img, width, height)
  return { width, height, png: bytesToBase64(png) }
}
