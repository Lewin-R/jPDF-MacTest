import { describe, expect, it } from 'vitest'
import { History } from '../../../src/core/session/history.svelte'
import type { Annotation, FreeTextAnnotation, ImageAnnotation } from '../../../src/core/session/model'
import {
  deletePage, deletePages, duplicatePage, duplicatePages, insertBlankPage, rotatePage, rotatePages, type PageHost,
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

  it('keeps a turned image inside the page box: shifted, or scaled down if it cannot fit', () => {
    const store = new AnnotationStore()
    // 80 x 20 at the bottom edge of a 600 x 800 page.
    const low: ImageAnnotation = { ...image('low', 0), rect: [100, 0, 180, 20] }
    // 300 x 100 on a page only 200 tall once turned.
    const wide: ImageAnnotation = { ...image('wide', 1), rect: [0, 0, 300, 100] }
    store.load([low, wide])
    const host: PageHost = { pages: identityPages(2) }
    const history = new History(store)
    history.execute(rotatePage(host, 0, 90, 0, [0, 0, 600, 800]))
    // Turned about its centre it would be [130, -30, 150, 50]: shifted up by 30.
    expect((store.get('low') as ImageAnnotation).rect).toEqual([130, 0, 150, 80])
    history.execute(rotatePage(host, 1, 90, 0, [0, 0, 400, 200]))
    // 100 x 300 does not fit 200 tall: scaled to 66.67 x 200, kept inside.
    const r = (store.get('wide') as ImageAnnotation).rect
    expect(r[3] - r[1]).toBeCloseTo(200)
    expect((r[3] - r[1]) / (r[2] - r[0])).toBeCloseTo(3)
    expect(r[1]).toBeCloseTo(0)
    expect(r[0]).toBeGreaterThanOrEqual(0)
    history.undo()
    history.undo()
    expect(store.get('low')).toBe(low)
    expect(store.get('wide')).toBe(wide)
  })
})

/** 5 pages; annotation `pN` on each page N. */
function setup5() {
  const store = new AnnotationStore()
  store.load([0, 1, 2, 3, 4].map((p) => hl(`p${p}`, p, `${p}R`)))
  const host: PageHost = { pages: identityPages(5) }
  const history = new History(store)
  return { store, host, history }
}

const sources = (host: PageHost) => host.pages.map((p) => (p.kind === 'source' ? p.source : -1))

describe('duplicatePages', () => {
  it('inserts copies in page order right after the last selected page', () => {
    const { store, host, history } = setup5()
    history.execute(duplicatePages(host, [3, 0, 1])!)
    expect(sources(host)).toEqual([0, 1, 2, 3, 0, 1, 3, 4])
    // The copies' annotations sit on the copies; later pages moved back by three.
    expect(store.byPage(4).map((a) => a.id)).not.toContain('p0')
    expect(store.byPage(4)).toHaveLength(1)
    expect(store.byPage(6)).toHaveLength(1)
    expect(store.byPage(7).map((a) => a.id)).toEqual(['p4'])
    expect(store.byPage(4)[0].sourceRef).toBeNull()
  })

  it('undo restores the pages and annotations; redo repeats with the same copies', () => {
    const { store, host, history } = setup5()
    const before = host.pages
    history.execute(duplicatePages(host, [1, 2])!)
    const copyIds = store.byPage(3).map((a) => a.id)
    history.undo()
    expect(host.pages).toBe(before)
    expect(layout(store)).toEqual(['p0@0', 'p1@1', 'p2@2', 'p3@3', 'p4@4'])
    history.redo()
    expect(store.byPage(3).map((a) => a.id)).toEqual(copyIds)
    expect(sources(host)).toEqual([0, 1, 2, 1, 2, 3, 4])
  })

  it('is null without pages', () => {
    expect(duplicatePages(setup5().host, [])).toBeNull()
  })
})

describe('deletePages', () => {
  it('deletes the pages and their annotations; undo restores them', () => {
    const { store, host, history } = setup5()
    const before = host.pages
    history.execute(deletePages(host, [3, 1])!)
    expect(sources(host)).toEqual([0, 2, 4])
    expect(layout(store).sort()).toEqual(['p0@0', 'p2@1', 'p4@2'])
    history.undo()
    expect(host.pages).toBe(before)
    expect(layout(store).sort()).toEqual(['p0@0', 'p1@1', 'p2@2', 'p3@3', 'p4@4'])
    expect(store.get('p1')?.sourceRef).toBe('1R')
  })

  it('is null when it would delete every page', () => {
    expect(deletePages(setup5().host, [0, 1, 2, 3, 4])).toBeNull()
  })
})

describe('rotatePages', () => {
  it('turns every listed page in one undo step', () => {
    const { host, history } = setup5()
    const before = host.pages
    history.execute(rotatePages(host, [{ i: 0, fileRotation: 0 }, { i: 3, fileRotation: 90 }], -90)!)
    expect(host.pages.map((p) => p.rotate)).toEqual([270, 0, 0, 270, 0])
    history.undo()
    expect(host.pages).toBe(before)
  })
})
