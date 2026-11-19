import { describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ readImage: vi.fn() }))
vi.mock('@tauri-apps/plugin-clipboard-manager', () => ({ readImage: h.readImage }))

import { readClipboardImage } from '../../../src/core/ipc/clipboard'

describe('readClipboardImage', () => {

  it('returns the RGBA pixels and size and releases the image', async () => {
    const close = vi.fn(async () => {})
    h.readImage.mockResolvedValue({
      size: async () => ({ width: 2, height: 1 }),
      rgba: async () => new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
      close,
    })
    expect(await readClipboardImage()).toEqual({ width: 2, height: 1, rgba: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]) })
    expect(close).toHaveBeenCalled()
  })

  it('is null when the clipboard holds no image (the plugin throws)', async () => {
    h.readImage.mockImplementation(async () => {
      throw 'The clipboard contents were not available in the requested format or the clipboard is empty.'
    })
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await readClipboardImage()).toBeNull()
    expect(err).not.toHaveBeenCalled()
    err.mockRestore()
  })

  it('is null and logs on other errors', async () => {
    h.readImage.mockImplementation(async () => {
      throw new Error('permission denied')
    })
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await readClipboardImage()).toBeNull()
    expect(err).toHaveBeenCalled()
    err.mockRestore()
  })

  it('is null for an empty or inconsistent image', async () => {
    h.readImage.mockResolvedValue({ size: async () => ({ width: 0, height: 0 }), rgba: async () => new Uint8Array(), close: async () => {} })
    expect(await readClipboardImage()).toBeNull()
    h.readImage.mockResolvedValue({ size: async () => ({ width: 2, height: 2 }), rgba: async () => new Uint8Array(4), close: async () => {} })
    expect(await readClipboardImage()).toBeNull()
  })
})
