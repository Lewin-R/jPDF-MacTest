import { describe, expect, it } from 'vitest'
import { History } from '../../../src/core/session/history.svelte'
import type { Annotation, FreeTextAnnotation, ImageAnnotation } from '../../../src/core/session/model'
import {
  deletePage, duplicatePage, insertBlankPage, rotatePage, type PageHost,
} from '../../../src/core/session/pageCommands'
import { identityPages, type PageEntry } from '../../../src/core/session/pages'
import { AnnotationStore } from '../../../src/core/session/store.svelte'

function hl(id: string, page: number, sourceRef: string | null = null): Annotation {
  return {
    id, page, sourceRef, modifiedAt: '2026-01-01T00:00:00Z', author: 'a',
    kind: 'highlight', quads: [[0, 1, 1, 1, 0, 0, 1, 0]], color: [1, 1, 0], opacity: 0.4,
  }
}

function text(id: string, page: number): FreeTextAnnotation {
  return {
    id, page, sourceRef: null, modifiedAt: '2026-01-01T00:00:00Z', author: 'a', kind: 'freetext',
    rect: [0, 0, 200, 40], text: 'one two three four five six', lines: ['one two three four five six'],
    fontSize: 12, textColor: [0, 0, 0], background: null,
  }
}

function image(id: string, page: number): ImageAnnotation {
  return {
    id, page, sourceRef: '12R', modifiedAt: '2026-01-01T00:00:00Z', author: 'a', kind: 'image',
    rect: [100, 200, 180, 240], image: { width: 4, height: 2, png: 'AA==' },
  }
}

/** 3 pages; page 0: a (10R), b; page 1: c (11R); page 2: d. */
function setup() {
  const store = new AnnotationStore()
  store.load([hl('a', 0, '10R'), hl('b', 0), hl('c', 1, '11R'), hl('d', 2)])
  const host: PageHost = { pages: identityPages(3) }
  const history = new History(store)
  const snapshot = () => ({ pages: host.pages, all: store.all() })
  return { store, host, history, snapshot }
}

const layout = (s: AnnotationStore) => s.all().map((a) => `${a.id}@${a.page}`)

describe('duplicatePage', () => {
  it('inserts a copy after the page with independent copies of its annotations', () => {
    const { store, host, history } = setup()
    history.execute(duplicatePage(host, 0))
    expect(host.pages).toEqual([
      { kind: 'source', source: 0, rotate: 0 }, { kind: 'source', source: 0, rotate: 0 },
      { kind: 'source', source: 1, rotate: 0 }, { kind: 'source', source: 2, rotate: 0 },
    ])
    const copies = store.byPage(1)
    expect(copies).toHaveLength(2)
    expect(copies.map((a) => a.id)).not.toContain('a')
    expect(copies.every((a) => a.sourceRef === null)).toBe(true)
    expect(copies.map((a) => (a.kind === 'highlight' ? a.quads : null))).toEqual(
      store.byPage(0).map((a) => (a.kind === 'highlight' ? a.quads : null)),
    )
    expect(store.byPage(0).map((a) => a.id)).toEqual(['a', 'b'])
    expect(store.byPage(2).map((a) => a.id)).toEqual(['c'])
    expect(store.byPage(3).map((a) => a.id)).toEqual(['d'])
  })

  it('copies pasted images too', () => {
    const store = new AnnotationStore()
    store.load([image('im', 0)])
    const host: PageHost = { pages: identityPages(1) }
    new History(store).execute(duplicatePage(host, 0))
    const [copy] = store.byPage(1)
    expect(copy).toMatchObject({ kind: 'image', page: 1, sourceRef: null, rect: [100, 200, 180, 240] })
    expect(copy.id).not.toBe('im')
    expect((copy as ImageAnnotation).image).toEqual(image('im', 0).image)
  })

  it('marks shifted annotations and the copies as changed', () => {
    const { store, host, history } = setup()
    store.markSaved({}, [])
    history.execute(duplicatePage(host, 0))
    const changed = store.changedSince().map((a) => a.id)
    expect(changed).toContain('c')
    expect(changed).toContain('d')
    expect(changed).not.toContain('a')
    expect(changed).toHaveLength(4)
  })

  it('undo restores page list and annotations exactly; redo reapplies the same copies', () => {
    const { store, host, history, snapshot } = setup()
    const before = snapshot()
    history.execute(duplicatePage(host, 1))
    const after = snapshot()
    history.undo()
    expect(host.pages).toBe(before.pages)
    expect(store.all()).toEqual(before.all)
    store.all().forEach((a, k) => expect(a).toBe(before.all[k]))
    history.redo()
    expect(host.pages).toEqual(after.pages)
    expect(store.all()).toEqual(after.all)
  })
})

describe('deletePage', () => {
  it('removes the page and its annotations and shifts later ones back', () => {
    const { store, host, history } = setup()
    history.execute(deletePage(host, 0)!)
    expect(host.pages).toEqual([
      { kind: 'source', source: 1, rotate: 0 }, { kind: 'source', source: 2, rotate: 0 },
    ])
    expect(layout(store)).toEqual(['c@0', 'd@1'])
    expect(store.deletedRefs()).toEqual([{ id: 'a', sourceRef: '10R' }])
    expect(store.changedSince().map((a) => a.id)).toEqual(['c', 'd'])
  })

  it('undo restores page list, annotations, refs and z-order exactly', () => {
    const { store, host, history, snapshot } = setup()
    const before = snapshot()
    history.execute(deletePage(host, 0)!)
    history.undo()
    expect(host.pages).toBe(before.pages)
    store.all().forEach((a, k) => expect(a).toBe(before.all[k]))
    expect(store.all()).toHaveLength(4)
    expect(store.deletedRefs()).toEqual([])
    history.redo()
    expect(layout(store)).toEqual(['c@0', 'd@1'])
  })

  it('refuses to delete the last remaining page', () => {
    const store = new AnnotationStore()
    expect(deletePage({ pages: identityPages(1) }, 0)).toBeNull()
    expect(store.all()).toEqual([])
  })
})

describe('insertBlankPage', () => {
  it('inserts a blank page after the page and shifts later annotations', () => {
    const { store, host, history, snapshot } = setup()
    const before = snapshot()
    history.execute(insertBlankPage(host, 1, { width: 100, height: 200, rotate: 90 }))
    expect(host.pages[2]).toEqual({ kind: 'blank', width: 100, height: 200, rotate: 90 })
    expect(host.pages).toHaveLength(4)
    expect(layout(store)).toEqual(['a@0', 'b@0', 'c@1', 'd@3'])
    history.undo()
    expect(host.pages).toBe(before.pages)
    store.all().forEach((a, k) => expect(a).toBe(before.all[k]))
  })
})

describe('rotatePage', () => {
  it('turns only that page and undo restores it', () => {
    const { host, history, snapshot } = setup()
    const before = snapshot()
    history.execute(rotatePage(host, 1, 90, 0))
    expect(host.pages.map((p: PageEntry) => p.rotate)).toEqual([0, 90, 0])
    history.execute(rotatePage(host, 1, -90, 0))
    history.execute(rotatePage(host, 1, -90, 0))
    expect(host.pages.map((p: PageEntry) => p.rotate)).toEqual([0, 270, 0])
    history.undo(); history.undo(); history.undo()
    expect(host.pages).toBe(before.pages)
  })

  it('re-wraps text boxes on the page for the new rotation (marked changed); undo restores them', () => {
    const store = new AnnotationStore()
    const t = text('t', 0)
    store.load([t, hl('h', 0)])
    const host: PageHost = { pages: identityPages(1) }
    const history = new History(store)
    // The box is 200 wide and 40 high: upright on a quarter-turned page it is 40 wide.
    history.execute(rotatePage(host, 0, 90, 0))
    const turned = store.get('t') as FreeTextAnnotation
    expect(turned.lines.length).toBeGreaterThan(1)
    expect(turned.rect).toEqual(t.rect)
    expect(store.changedSince().map((a) => a.id)).toEqual(['t'])
    history.undo()
    expect(store.get('t')).toBe(t)
  })

  it('keeps pasted images upright and unstretched: their rect turns about its centre', () => {
    const store = new AnnotationStore()
    const im = image('im', 0)
    store.load([im])
    const host: PageHost = { pages: identityPages(1) }
    const history = new History(store)
    // 80 x 40 centred on (140, 220) becomes 40 x 80.
    history.execute(rotatePage(host, 0, 90, 0))
    expect((store.get('im') as ImageAnnotation).rect).toEqual([120, 180, 160, 260])
    history.execute(rotatePage(host, 0, 90, 0))
    expect((store.get('im') as ImageAnnotation).rect).toEqual([100, 200, 180, 240])
    history.undo()
    history.undo()
    expect(store.get('im')).toBe(im)
  })
})
