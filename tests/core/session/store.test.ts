import { describe, expect, it } from 'vitest'
import type { Annotation } from '../../../src/core/session/model'
import { AnnotationStore } from '../../../src/core/session/store.svelte'

function hl(id: string, page = 0, sourceRef: string | null = null): Annotation {
  return {
    id, page, sourceRef, modifiedAt: '2026-01-01T00:00:00Z', author: 'a',
    kind: 'highlight', quads: [[0, 1, 1, 1, 0, 0, 1, 0]], color: [1, 1, 0], opacity: 0.4,
  }
}

describe('AnnotationStore', () => {
  it('add then byPage returns it', () => {
    const s = new AnnotationStore()
    const a = hl('a', 2)
    s.add(a)
    expect(s.byPage(2)).toEqual([a])
    expect(s.byPage(0)).toEqual([])
    expect(s.get('a')).toBe(a)
    expect(s.all()).toEqual([a])
  })

  it('keeps insertion order as z-order', () => {
    const s = new AnnotationStore()
    s.add(hl('a')); s.add(hl('b')); s.add(hl('c'))
    expect(s.byPage(0).map((x) => x.id)).toEqual(['a', 'b', 'c'])
  })

  it('update replaces object in place', () => {
    const s = new AnnotationStore()
    s.add(hl('a')); s.add(hl('b'))
    const next = { ...hl('a'), opacity: 0.9 }
    s.update('a', next)
    expect(s.get('a')).toBe(next)
    expect(s.byPage(0).map((x) => x.id)).toEqual(['a', 'b'])
    expect(s.byPage(0)[0]).toBe(next)
  })

  it('add with index inserts at that z-position', () => {
    const s = new AnnotationStore()
    s.add(hl('a')); s.add(hl('c'))
    s.add(hl('b'), 1)
    expect(s.byPage(0).map((x) => x.id)).toEqual(['a', 'b', 'c'])
  })

  it('all() order matches byPage, also after a cross-page update', () => {
    const s = new AnnotationStore()
    s.add(hl('a', 0)); s.add(hl('b', 1)); s.add(hl('c', 0))
    s.update('a', hl('a', 1))
    expect(s.all().map((x) => x.id)).toEqual(['c', 'b', 'a'])
    expect(s.byPage(1).map((x) => x.id)).toEqual(['b', 'a'])
  })

  it('update can move an annotation to another page', () => {
    const s = new AnnotationStore()
    s.add(hl('a', 0))
    s.update('a', hl('a', 1))
    expect(s.byPage(0)).toEqual([])
    expect(s.byPage(1).map((x) => x.id)).toEqual(['a'])
  })

  it('remove then deletedSourceRefs contains its sourceRef only if it had one', () => {
    const s = new AnnotationStore()
    s.load([hl('saved', 0, '12R'), hl('plain', 0)])
    s.add(hl('fresh'))
    s.remove('saved'); s.remove('plain'); s.remove('fresh')
    expect(s.deletedSourceRefs()).toEqual(['12R'])
    expect(s.all()).toEqual([])
  })

  it('markSaved assigns sourceRefs and clears changedSince', () => {
    const s = new AnnotationStore()
    s.add(hl('a'))
    expect(s.changedSince().map((x) => x.id)).toEqual(['a'])
    s.markSaved({ a: '7R' })
    expect(s.get('a')?.sourceRef).toBe('7R')
    expect(s.byPage(0)[0].sourceRef).toBe('7R')
    expect(s.changedSince()).toEqual([])
    s.remove('a')
    expect(s.deletedSourceRefs()).toEqual(['7R'])
    s.markSaved({})
    expect(s.deletedSourceRefs()).toEqual([])
  })

  it('load does not count as a change; update after load does', () => {
    const s = new AnnotationStore()
    s.load([hl('a', 0, '1R'), hl('b', 0, '2R')])
    expect(s.changedSince()).toEqual([])
    s.update('b', { ...hl('b', 0, '2R'), opacity: 0.1 })
    expect(s.changedSince().map((x) => x.id)).toEqual(['b'])
  })

  it('re-adding a removed saved annotation (undo of delete) removes it from deletedSourceRefs', () => {
    const s = new AnnotationStore()
    const a = hl('a', 0, '3R')
    s.load([a])
    s.remove('a')
    expect(s.deletedSourceRefs()).toEqual(['3R'])
    s.add(a)
    expect(s.deletedSourceRefs()).toEqual([])
  })

  it('a removed annotation is no longer in changedSince', () => {
    const s = new AnnotationStore()
    s.add(hl('a'))
    s.remove('a')
    expect(s.changedSince()).toEqual([])
  })
})
