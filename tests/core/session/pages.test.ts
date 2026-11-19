import { describe, expect, it } from 'vitest'
import {
  firstOccurrences, identityPages, insertEntry, isIdentity, pagePlan, pageSizesOf, remapForDelete,
  remapForInsert, removeEntry, rotateEntry, type PageEntry,
} from '../../../src/core/session/pages'

const src = (source: number, rotate = 0): PageEntry => ({ kind: 'source', source, rotate })
const A4 = { width: 595, height: 842 }
const WIDE = { width: 800, height: 600 }

describe('page list operations', () => {
  it('identityPages has one unrotated source entry per file page', () => {
    expect(identityPages(3)).toEqual([src(0), src(1), src(2)])
  })

  it('isIdentity is true only for the unchanged file order', () => {
    expect(isIdentity(identityPages(3), 3)).toBe(true)
    expect(isIdentity(identityPages(2), 3)).toBe(false)
    expect(isIdentity([src(0), src(2), src(1)], 3)).toBe(false)
    expect(isIdentity([src(0), src(1, 90), src(2)], 3)).toBe(false)
    expect(isIdentity([src(0), { kind: 'blank', width: 1, height: 1, rotate: 0 }], 2)).toBe(false)
  })

  it('insertEntry and removeEntry return new lists', () => {
    const pages = identityPages(2)
    const blank: PageEntry = { kind: 'blank', width: 10, height: 20, rotate: 90 }
    const inserted = insertEntry(pages, 1, blank)
    expect(inserted).toEqual([src(0), blank, src(1)])
    expect(pages).toEqual(identityPages(2))
    expect(removeEntry(inserted, 0)).toEqual([blank, src(1)])
  })

  it('rotateEntry turns only the given page', () => {
    const pages = identityPages(3)
    expect(rotateEntry(pages, 1, 90)).toEqual([src(0), src(1, 90), src(2)])
    expect(rotateEntry(pages, 1, -90)).toEqual([src(0), src(1, 270), src(2)])
    const blank: PageEntry = { kind: 'blank', width: 10, height: 20, rotate: 270 }
    expect(rotateEntry([blank], 0, 90)).toEqual([{ ...blank, rotate: 0 }])
  })
})

describe('firstOccurrences', () => {
  it('marks only the first page showing each file page', () => {
    const blank: PageEntry = { kind: 'blank', width: 1, height: 1, rotate: 0 }
    expect(firstOccurrences([src(1), src(0), src(1, 90), blank, src(0)])).toEqual([true, true, false, true, false])
  })
})

describe('annotation page remapping', () => {
  it('insert shifts pages at or after the insertion point', () => {
    const f = remapForInsert(2)
    expect([0, 1, 2, 3].map(f)).toEqual([0, 1, 3, 4])
  })

  it('delete drops the deleted page and shifts later ones back', () => {
    const f = remapForDelete(1)
    expect([0, 1, 2, 3].map(f)).toEqual([0, null, 1, 2])
  })
})

describe('pageSizesOf', () => {
  it('uses the file size for source pages, swapped for an odd extra quarter turn', () => {
    const sizes = [A4, WIDE]
    expect(pageSizesOf([src(0), src(1, 90), src(0, 180), src(1, 270)], sizes)).toEqual([
      A4, { width: 600, height: 800 }, A4, { width: 600, height: 800 },
    ])
  })

  it('uses the blank size, rotated by the blank rotation', () => {
    const blank = (rotate: number): PageEntry => ({ kind: 'blank', width: 100, height: 200, rotate })
    expect(pageSizesOf([blank(0), blank(90), blank(180)], [])).toEqual([
      { width: 100, height: 200 }, { width: 200, height: 100 }, { width: 100, height: 200 },
    ])
  })
})

describe('pagePlan', () => {
  it('gives absolute rotations: file /Rotate plus the extra rotation', () => {
    const blank: PageEntry = { kind: 'blank', width: 100, height: 200, rotate: 90 }
    expect(pagePlan([src(1, 90), src(0), blank], [270, 90])).toEqual([
      { kind: 'source', index: 1, rotate: 180 },
      { kind: 'source', index: 0, rotate: 270 },
      { kind: 'blank', width: 100, height: 200, rotate: 90 },
    ])
  })
})
