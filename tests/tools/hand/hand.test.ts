import { describe, expect, it, vi } from 'vitest'
import { createHandHandler, handTool } from '../../../src/tools/hand'
import type { PagePointerEvent, ToolContext } from '../../../src/core/registry/tools'

const ev = (clientX: number, clientY: number, screen: [number, number] = [0, 0]) =>
  ({ page: 0, pdf: [0, 0], screen, vp: {}, native: { clientX, clientY }, toPdf: () => [0, 0] }) as unknown as PagePointerEvent

describe('hand', () => {
  it('is a single-instance tool without options', () => {
    expect(handTool).toMatchObject({ shortcut: 'H', allowMultipleInstances: false, Options: null })
    expect(handTool.cursor!({})).toBe('grab')
  })

  it('scrolls by the negated client delta, ignoring page-local coordinates', () => {
    const scrollBy = vi.fn()
    const cursor = vi.fn()
    const handler = createHandHandler({ session: { scrollBy }, cursor: { set: cursor } } as unknown as ToolContext)
    handler.onPointerDown!(ev(100, 100))
    expect(cursor).toHaveBeenLastCalledWith('grabbing')
    handler.onPointerMove!(ev(90, 130, [5, 5]))
    expect(scrollBy).toHaveBeenLastCalledWith(10, -30)
    handler.onPointerMove!(ev(95, 130, [999, 999]))
    expect(scrollBy).toHaveBeenLastCalledWith(-5, -0)
    handler.onPointerUp!(ev(95, 130))
    expect(cursor).toHaveBeenLastCalledWith(null)
    handler.onPointerMove!(ev(0, 0))
    expect(scrollBy).toHaveBeenCalledTimes(2)
  })
})
