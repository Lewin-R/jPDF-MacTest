import { describe, expect, it, vi } from 'vitest'
import { TabsStore } from '../../src/app/tabs.svelte'
import type { DocumentSession } from '../../src/core/session/session.svelte'

let n = 0
function fake(path: string): DocumentSession {
  return { id: `s${++n}`, path, dispose: vi.fn(async () => {}) } as unknown as DocumentSession
}

describe('TabsStore', () => {
  it('add activates new session', () => {
    const t = new TabsStore()
    const a = fake('C:\a.pdf')
    const b = fake('C:\b.pdf')
    t.add(a)
    expect(t.activeId).toBe(a.id)
    t.add(b)
    expect(t.activeId).toBe(b.id)
    expect(t.active?.id).toBe(b.id)
    expect(t.sessions).toHaveLength(2)
  })

  it('add same path twice activates existing, keeps one tab', () => {
    const t = new TabsStore()
    const a = fake('C:\a.pdf')
    const b = fake('C:\b.pdf')
    const dup = fake('c:\A.PDF')
    t.add(a)
    t.add(b)
    t.add(dup)
    expect(t.sessions).toHaveLength(2)
    expect(t.activeId).toBe(a.id)
  })

  it('close active activates right neighbour, else left', async () => {
    const t = new TabsStore()
    const [a, b, c] = [fake('a'), fake('b'), fake('c')]
    t.add(a)
    t.add(b)
    t.add(c)
    t.activeId = b.id
    await t.close(b.id)
    expect(t.activeId).toBe(c.id)
    await t.close(c.id)
    expect(t.activeId).toBe(a.id)
  })

  it('close inactive keeps the active tab', async () => {
    const t = new TabsStore()
    const [a, b] = [fake('a'), fake('b')]
    t.add(a)
    t.add(b)
    await t.close(a.id)
    expect(t.activeId).toBe(b.id)
  })

  it('close last leaves activeId null and calls dispose', async () => {
    const t = new TabsStore()
    const a = fake('a')
    t.add(a)
    await t.close(a.id)
    expect(t.activeId).toBeNull()
    expect(t.active).toBeNull()
    expect(a.dispose).toHaveBeenCalledOnce()
  })

  it('next/prev wrap around', () => {
    const t = new TabsStore()
    const [a, b, c] = [fake('a'), fake('b'), fake('c')]
    t.add(a)
    t.add(b)
    t.add(c)
    t.next()
    expect(t.activeId).toBe(a.id)
    t.prev()
    expect(t.activeId).toBe(c.id)
    t.prev()
    expect(t.activeId).toBe(b.id)
  })

  it('next/prev do nothing without tabs', () => {
    const t = new TabsStore()
    t.next()
    t.prev()
    expect(t.activeId).toBeNull()
  })
})
