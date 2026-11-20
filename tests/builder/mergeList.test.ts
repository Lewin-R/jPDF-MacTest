import { describe, expect, it } from 'vitest'
import {
  blockers, dropIndex, mergedName, moveItem, readyToMerge, totalPages, type MergeItem,
} from '../../src/builder/merge/mergeList'

const item = (id: number, pages: number | null, error: string | null = null): MergeItem => ({
  id, path: `C:\\docs\\${id}.pdf`, name: `${id}.pdf`, pages, error,
})

describe('mergeList', () => {
  it('moveItem moves one entry and keeps the rest in order', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a'])
    expect(moveItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b'])
    expect(moveItem(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'b', 'c'])
  })

  it('moveItem clamps the target and ignores a missing source', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 9)).toEqual(['b', 'c', 'a'])
    expect(moveItem(['a', 'b', 'c'], 1, -3)).toEqual(['b', 'a', 'c'])
    const list = ['a', 'b']
    expect(moveItem(list, 5, 0)).toBe(list)
  })

  it('totalPages sums the loaded files', () => {
    expect(totalPages([item(1, 3), item(2, null), item(3, 4)])).toBe(7)
    expect(totalPages([])).toBe(0)
  })

  it('readyToMerge needs two loaded files without errors', () => {
    expect(readyToMerge([item(1, 1)])).toBe(false)
    expect(readyToMerge([item(1, 1), item(2, 2)])).toBe(true)
    expect(readyToMerge([item(1, 1), item(2, null)])).toBe(false)
    expect(readyToMerge([item(1, 1), item(2, null, 'encrypted')])).toBe(false)
  })

  it('mergedName puts "<name> merged.pdf" next to the first file', () => {
    expect(mergedName('C:\\a\\Report.pdf')).toBe('C:\\a\\Report merged.pdf')
    expect(mergedName('C:\\a\\Scan.PDF')).toBe('C:\\a\\Scan merged.pdf')
    expect(mergedName('/home/x/notes.v2.pdf')).toBe('/home/x/notes.v2 merged.pdf')
    expect(mergedName('plain')).toBe('plain merged.pdf')
  })

  it('dropIndex counts the row middles above the pointer', () => {
    const mids = [20, 60, 100]
    expect(dropIndex(0, mids)).toBe(0)
    expect(dropIndex(30, mids)).toBe(1)
    expect(dropIndex(60, mids)).toBe(1)
    expect(dropIndex(61, mids)).toBe(2)
    expect(dropIndex(500, mids)).toBe(3)
  })

  it('blockers lists each listed file that has unsaved changes once', () => {
    const dirty = new Set(['b.pdf'])
    expect(blockers(['a.pdf', 'b.pdf', 'b.pdf'], (p) => dirty.has(p))).toEqual(['b.pdf'])
    expect(blockers(['a.pdf'], () => false)).toEqual([])
  })
})
