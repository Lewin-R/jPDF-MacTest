import { describe, expect, it } from 'vitest'
import {
  clampSelection, clickPage, emptySelection, selectAll, selectOnly, sortedSelection,
} from '../../src/builder/selection'

const ids = (s: { selected: ReadonlySet<number> }) => [...s.selected].sort((a, b) => a - b)

describe('page selection', () => {
  it('a click toggles a page', () => {
    let s = clickPage(emptySelection, 2, false)
    expect(ids(s)).toEqual([2])
    s = clickPage(s, 5, false)
    expect(ids(s)).toEqual([2, 5])
    s = clickPage(s, 2, false)
    expect(ids(s)).toEqual([5])
  })

  it('Shift+click adds every page between the previous click and this one', () => {
    let s = clickPage(emptySelection, 1, false)
    s = clickPage(s, 4, true)
    expect(ids(s)).toEqual([1, 2, 3, 4])
    // Backwards from the new anchor, keeping what was selected.
    s = clickPage(s, 8, false)
    s = clickPage(s, 6, true)
    expect(ids(s)).toEqual([1, 2, 3, 4, 6, 7, 8])
  })

  it('Shift+click without a previous click toggles like a click', () => {
    expect(ids(clickPage(emptySelection, 3, true))).toEqual([3])
  })

  it('select all, select only, sorted', () => {
    expect(ids(selectAll(3))).toEqual([0, 1, 2])
    const s = selectOnly([7, 5, 6])
    expect(sortedSelection(s)).toEqual([5, 6, 7])
    expect(s.anchor).toBe(6)
  })

  it('clamping drops pages past the end and keeps the same object when nothing changes', () => {
    const s = clickPage(clickPage(emptySelection, 1, false), 4, false)
    expect(clampSelection(s, 5)).toBe(s)
    const c = clampSelection(s, 3)
    expect(ids(c)).toEqual([1])
    expect(c.anchor).toBeNull()
  })
})
