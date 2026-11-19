import { readImage } from '@tauri-apps/plugin-clipboard-manager'
import type { RgbaImage } from '../../annotations/image/encode'

/** An image on the system clipboard: unpremultiplied 8-bit RGBA pixels. */
export type ClipboardImage = RgbaImage

/**
 * The plugin rejects when the clipboard holds no image (arboard's
 * "ContentNotAvailable": "…not available in the requested format or the
 * clipboard is empty").
 */
const NO_IMAGE = /not available|empty/i

/** The image on the clipboard; null when there is none or it cannot be read (logged). */
export async function readClipboardImage(): Promise<ClipboardImage | null> {
  let image: Awaited<ReturnType<typeof readImage>> | null = null
  try {
    image = await readImage()
    const { width, height } = await image.size()
    const rgba = await image.rgba()
    if (width <= 0 || height <= 0 || rgba.length !== width * height * 4) return null
    return { width, height, rgba }
  } catch (e) {
    if (!NO_IMAGE.test(String(e))) console.error('Could not read the clipboard image', e)
    return null
  } finally {
    image?.close().catch(() => {})
  }
}
