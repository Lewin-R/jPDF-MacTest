import { describe, expect, it, vi } from 'vitest'
import { RenderCache, releaseCanvas } from '../../../src/core/viewer/renderCache'

interface Entry {
  width: number
  height: number
  close: () => void
}

/** A fake rendered page of `w` x `h` pixels (4 bytes each). */
function entry(w = 10, h = 10): Entry {
  return { width: w, height: h, close: vi.fn() }
}

class RenderCacheOf extends RenderCache<Entry> {
  constructor(maxBytes: number) {
    super(maxBytes, (e) => e.width * e.height * 4, (e) => e.close())
  }
}

/** Bytes of a default 10x10 entry. */
const B = 400

describe('RenderCache', () => {
  it('evicts least recently used beyond the byte budget and releases it', () => {
    const c = new RenderCacheOf(2 * B)
    const a = entry(), b = entry(), d = entry()
    c.set('1@1', a)
    c.set('2@1', b)
    c.set('3@1', d)
    expect(c.get('1@1')).toBeUndefined()
    expect(a.close).toHaveBeenCalledOnce()
    expect(c.get('2@1')).toBe(b)
    expect(c.get('3@1')).toBe(d)
    expect(b.close).not.toHaveBeenCalled()
    expect(c.size).toBe(2 * B)
  })

  it('budget counts pixels, not entries', () => {
    const c = new RenderCacheOf(10 * B)
    const small = Array.from({ length: 6 }, () => entry())
    small.forEach((s, i) => c.set(`${i}@1`, s))
    const big = entry(20, 20) // 4 * B
    c.set('big@1', big)
    expect(c.get('big@1')).toBe(big)
    expect(c.size).toBe(10 * B)
    expect(small.filter((s) => vi.mocked(s.close).mock.calls.length > 0)).toHaveLength(0)
    c.set('more@1', entry())
    expect(small[0].close).toHaveBeenCalledOnce()
    expect(c.size).toBe(10 * B)
  })

  it('keeps an entry larger than the whole budget until the next set', () => {
    const c = new RenderCacheOf(B)
    const a = entry(), huge = entry(100, 100)
    c.set('1@1', a)
    c.set('2@1', huge)
    expect(a.close).toHaveBeenCalledOnce()
    expect(c.get('2@1')).toBe(huge)
  })

  it('get refreshes recency', () => {
    const c = new RenderCacheOf(2 * B)
    const a = entry(), b = entry(), d = entry()
    c.set('1@1', a)
    c.set('2@1', b)
    expect(c.get('1@1')).toBe(a)
    c.set('3@1', d)
    expect(c.get('2@1')).toBeUndefined()
    expect(b.close).toHaveBeenCalledOnce()
    expect(c.get('1@1')).toBe(a)
  })

  it('set on an existing key releases the replaced entry', () => {
    const c = new RenderCacheOf(2 * B)
    const a = entry(), b = entry()
    c.set('1@1', a)
    c.set('1@1', b)
    expect(a.close).toHaveBeenCalledOnce()
    expect(c.get('1@1')).toBe(b)
    expect(c.size).toBe(B)
  })

  it('setting the same entry again does not release it', () => {
    const c = new RenderCacheOf(2 * B)
    const a = entry()
    c.set('1@1', a)
    c.set('1@1', a)
    expect(a.close).not.toHaveBeenCalled()
    expect(c.size).toBe(B)
  })

  it('set drops other scales of the same page only', () => {
    const c = new RenderCacheOf(10 * B)
    const p1a = entry(), p1b = entry(), p10 = entry(), p1c = entry()
    c.set('s:1@1.5', p1a)
    c.set('s:10@1.5', p10)
    c.set('s:1@2', p1b)
    expect(p1a.close).toHaveBeenCalledOnce()
    expect(c.get('s:1@1.5')).toBeUndefined()
    expect(c.get('s:10@1.5')).toBe(p10)
    c.set('t:1@3', p1c)
    expect(c.get('s:1@2')).toBe(p1b)
    expect(c.size).toBe(3 * B)
  })

  it('evictPrefix releases and removes matching entries only', () => {
    const c = new RenderCacheOf(4 * B)
    const a = entry(), b = entry(), d = entry()
    c.set('s1:1@1', a)
    c.set('s1:2@1', b)
    c.set('s2:1@1', d)
    c.evictPrefix('s1:')
    expect(a.close).toHaveBeenCalledOnce()
    expect(b.close).toHaveBeenCalledOnce()
    expect(c.get('s1:1@1')).toBeUndefined()
    expect(c.get('s2:1@1')).toBe(d)
    expect(d.close).not.toHaveBeenCalled()
    expect(c.size).toBe(B)
  })

  it('evict drops and releases one entry by identity', () => {
    const c = new RenderCacheOf(4 * B)
    const a = entry(), b = entry()
    c.set('1@1', a)
    c.set('2@1', b)
    c.evict(a)
    expect(a.close).toHaveBeenCalledOnce()
    expect(c.get('1@1')).toBeUndefined()
    expect(c.get('2@1')).toBe(b)
    expect(c.size).toBe(B)
  })

  it('holds tells whether an entry is cached', () => {
    const c = new RenderCacheOf(B)
    const a = entry(), b = entry()
    c.set('1@1', a)
    expect(c.holds(a)).toBe(true)
    c.set('2@1', b)
    expect(c.holds(a)).toBe(false)
    expect(c.holds(b)).toBe(true)
  })
})

describe('releaseCanvas', () => {
  it('frees a detached canvas but not one on screen', () => {
    const detached = document.createElement('canvas')
    detached.width = 30
    releaseCanvas(detached)
    expect([detached.width, detached.height]).toEqual([0, 0])
    const onScreen = document.body.appendChild(document.createElement('canvas'))
    onScreen.width = 30
    releaseCanvas(onScreen)
    expect(onScreen.width).toBe(30)
    onScreen.remove()
  })
})
