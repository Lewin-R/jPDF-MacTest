import { describe, expect, it, vi } from 'vitest'
import { RenderCache } from '../../../src/core/viewer/renderCache'

function bmp(): ImageBitmap {
  return { close: vi.fn() } as unknown as ImageBitmap
}

describe('RenderCache', () => {
  it('RenderCache evicts least recently used and calls close()', () => {
    const c = new RenderCache(2)
    const a = bmp(), b = bmp(), d = bmp()
    c.set('1@1', a)
    c.set('2@1', b)
    c.set('3@1', d)
    expect(c.get('1@1')).toBeUndefined()
    expect(a.close).toHaveBeenCalledOnce()
    expect(c.get('2@1')).toBe(b)
    expect(c.get('3@1')).toBe(d)
    expect(b.close).not.toHaveBeenCalled()
  })

  it('get refreshes recency', () => {
    const c = new RenderCache(2)
    const a = bmp(), b = bmp(), d = bmp()
    c.set('1@1', a)
    c.set('2@1', b)
    expect(c.get('1@1')).toBe(a)
    c.set('3@1', d)
    expect(c.get('2@1')).toBeUndefined()
    expect(b.close).toHaveBeenCalledOnce()
    expect(c.get('1@1')).toBe(a)
  })

  it('set on an existing key closes the replaced bitmap', () => {
    const c = new RenderCache(2)
    const a = bmp(), b = bmp()
    c.set('1@1', a)
    c.set('1@1', b)
    expect(a.close).toHaveBeenCalledOnce()
    expect(c.get('1@1')).toBe(b)
  })

  it('evictPrefix closes and removes matching entries only', () => {
    const c = new RenderCache(4)
    const a = bmp(), b = bmp(), d = bmp()
    c.set('s1:1@1', a)
    c.set('s1:2@1', b)
    c.set('s2:1@1', d)
    c.evictPrefix('s1:')
    expect(a.close).toHaveBeenCalledOnce()
    expect(b.close).toHaveBeenCalledOnce()
    expect(c.get('s1:1@1')).toBeUndefined()
    expect(c.get('s2:1@1')).toBe(d)
    expect(d.close).not.toHaveBeenCalled()
  })
})
