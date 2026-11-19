import { describe, expect, it } from 'vitest'
import { placeCard, type Box } from '../../../src/core/viewer/cardPlacement'

// A viewer 1000 x 800 at the window's top-left (bounds already inset by the margin).
const bounds: Box = { left: 8, top: 8, right: 992, bottom: 792 }
const box = (left: number, top: number, width: number, height: number): Box => ({
  left, top, right: left + width, bottom: top + height,
})
const card = { width: 256, height: 300 }

describe('placeCard', () => {
  it('opens above a bar that sits above the selection, aligned with the bar', () => {
    const sel = box(100, 500, 200, 100)
    const bar = box(100, 454, 190, 34)
    expect(placeCard({ bar, selection: sel, card, barAbove: true, bounds })).toEqual({ left: 100, top: 148, maxHeight: 784 })
  })

  it('opens below a bar that sits below the selection', () => {
    const sel = box(100, 20, 200, 100)
    const bar = box(100, 132, 190, 34)
    expect(placeCard({ bar, selection: sel, card, barAbove: false, bounds })?.top).toBe(172)
  })

  it('opens beside the selection when there is no room away from it', () => {
    // Bar above, but only 150 px above it: to the right of the selection, top-aligned with the bar.
    const sel = box(100, 200, 200, 400)
    const bar = box(100, 154, 190, 34)
    expect(placeCard({ bar, selection: sel, card, barAbove: true, bounds })).toEqual({ left: 306, top: 154, maxHeight: 784 })
  })

  it('takes the left side when the right side has no room', () => {
    const sel = box(600, 200, 380, 500)
    const bar = box(600, 154, 190, 34)
    expect(placeCard({ bar, selection: sel, card, barAbove: true, bounds })?.left).toBe(600 - 6 - 256)
  })

  it('clears a bar wider than the selection when opening on the right', () => {
    const sel = box(100, 200, 40, 500)
    const bar = box(100, 154, 190, 34)
    expect(placeCard({ bar, selection: sel, card, barAbove: true, bounds })?.left).toBe(296)
  })

  it('covers the selection only when nothing else fits, still inside the viewer', () => {
    const sel = box(8, 150, 984, 600)
    const bar = box(400, 104, 190, 34)
    const p = placeCard({ bar, selection: sel, card, barAbove: true, bounds })!
    // Below the bar (over the selection), aligned with it.
    expect(p).toEqual({ left: 400, top: 144, maxHeight: 784 })
  })

  it('keeps the card inside the viewer horizontally', () => {
    const sel = box(850, 500, 100, 100)
    const bar = box(850, 454, 190, 34)
    expect(placeCard({ bar, selection: sel, card, barAbove: true, bounds })?.left).toBe(992 - 256)
  })

  it('caps the height to the viewer and scrolls a card taller than it', () => {
    const small: Box = { left: 8, top: 8, right: 992, bottom: 208 }
    const sel = box(100, 120, 100, 50)
    const bar = box(100, 74, 190, 34)
    const p = placeCard({ bar, selection: sel, card, barAbove: true, bounds: small })!
    expect(p.maxHeight).toBe(200)
    expect(p.top).toBe(8)
  })

  it('is null once the selection has scrolled out of the viewer', () => {
    const sel = box(100, 900, 200, 100)
    const bar = box(100, 854, 190, 34)
    expect(placeCard({ bar, selection: sel, card, barAbove: true, bounds })).toBeNull()
  })
})
