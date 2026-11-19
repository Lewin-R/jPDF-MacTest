import { describe, expect, it, vi } from 'vitest'
import { pageMenuItems } from '../../src/app/pageMenu'
import { rightClickErases } from '../../src/tools/rightClick'

describe('rightClickErases', () => {
  it('erases with the drawing tools: pen, text box, shape, freehand marker, eraser', () => {
    expect(rightClickErases('pen', {})).toBe(true)
    expect(rightClickErases('text', {})).toBe(true)
    expect(rightClickErases('shape', {})).toBe(true)
    expect(rightClickErases('eraser', {})).toBe(true)
    expect(rightClickErases('marker', { mode: 'freehand' })).toBe(true)
  })

  it('opens the page menu instead with select, hand and the text-selection marker', () => {
    expect(rightClickErases('select', {})).toBe(false)
    expect(rightClickErases('hand', {})).toBe(false)
    expect(rightClickErases('marker', { mode: 'text' })).toBe(false)
    expect(rightClickErases('marker', undefined)).toBe(false)
  })

  it('opens the page menu for unknown or no tool', () => {
    expect(rightClickErases('future', {})).toBe(false)
    expect(rightClickErases(null, null)).toBe(false)
  })
})

describe('pageMenuItems', () => {
  it('lists the page actions for the page that was right-clicked (1-based)', () => {
    expect(pageMenuItems(3).map((i) => i.label)).toEqual([
      'Insert as…',
      'Duplicate page 3',
      'Delete page 3',
      'Insert empty page after page 3',
      'Rotate right',
      'Rotate left',
    ])
  })

  it('marks delete as dangerous', () => {
    expect(pageMenuItems(1).find((i) => i.label === 'Delete page 1')?.danger).toBe(true)
  })

  it('items are placeholders for now: choosing one runs without side effects', () => {
    const log = vi.spyOn(console, 'error')
    for (const item of pageMenuItems(2)) expect(() => item.run()).not.toThrow()
    expect(log).not.toHaveBeenCalled()
    log.mockRestore()
  })
})
