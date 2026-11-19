import { describe, expect, it, vi } from 'vitest'
import { pageMenuItems } from '../../src/app/pageMenu'
import type { MenuItem } from '../../src/ui/ContextMenu.svelte'
import { toasts } from '../../src/ui/toasts.svelte'
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

function actions(canDelete = true) {
  return {
    duplicatePage: vi.fn(),
    deletePage: vi.fn(),
    insertBlankPage: vi.fn(async () => {}),
    rotatePage: vi.fn(async () => {}),
    canDeletePage: () => canDelete,
  }
}

const item = (items: MenuItem[], label: string) => items.find((i) => i.label === label)!

describe('pageMenuItems', () => {
  it('lists the page actions for the page that was right-clicked (1-based)', () => {
    expect(pageMenuItems(3, actions()).map((i) => i.label)).toEqual([
      'Insert image',
      'Insert empty page after page 3',
      'Duplicate page 3',
      'Rotate right',
      'Rotate left',
      'Delete page 3',
    ])
  })

  it('marks delete as dangerous', () => {
    expect(item(pageMenuItems(1, actions()), 'Delete page 1').danger).toBe(true)
  })

  it('runs the page operation on the clicked page (0-based)', () => {
    const a = actions()
    const items = pageMenuItems(3, a)
    item(items, 'Duplicate page 3').run()
    item(items, 'Delete page 3').run()
    item(items, 'Insert empty page after page 3').run()
    item(items, 'Rotate right').run()
    item(items, 'Rotate left').run()
    expect(a.duplicatePage).toHaveBeenCalledWith(2)
    expect(a.deletePage).toHaveBeenCalledWith(2)
    expect(a.insertBlankPage).toHaveBeenCalledWith(2)
    expect(a.rotatePage.mock.calls).toEqual([[2, 90], [2, -90]])
  })

  it('disables delete when only one page is left', () => {
    expect(item(pageMenuItems(1, actions(false)), 'Delete page 1').disabled).toBe(true)
    expect(item(pageMenuItems(1, actions(true)), 'Delete page 1').disabled).toBeFalsy()
  })

  it('reports a failed page operation with a toast', async () => {
    const a = actions()
    a.rotatePage.mockRejectedValue(new Error('boom'))
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    item(pageMenuItems(1, a), 'Rotate right').run()
    await vi.waitFor(() => expect(toasts.items.at(-1)?.message).toBe('Could not rotate the page'))
    err.mockRestore()
  })

  it('Insert image is disabled without a clipboard image', () => {
    expect(item(pageMenuItems(2, actions()), 'Insert image').disabled).toBe(true)
    const insert = vi.fn()
    const i = item(pageMenuItems(2, actions(), { image: null, insert }), 'Insert image')
    expect(i.disabled).toBe(true)
  })

  it('Insert image is enabled with a clipboard image and inserts that image', () => {
    const image = { width: 1, height: 1, rgba: new Uint8Array(4) }
    const insert = vi.fn(async () => {})
    const a = actions()
    const i = item(pageMenuItems(2, a, { image, insert }), 'Insert image')
    expect(i.disabled).toBe(false)
    i.run()
    expect(insert).toHaveBeenCalledWith(image)
    expect(Object.values(a).filter((f) => typeof f === 'function' && 'mock' in f && f.mock.calls.length)).toEqual([])
  })

  it('reports a failed insert with a toast', async () => {
    const insert = vi.fn(async () => {
      throw new Error('boom')
    })
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    item(pageMenuItems(1, actions(), { image: { width: 1, height: 1, rgba: new Uint8Array(4) }, insert }), 'Insert image').run()
    await vi.waitFor(() => expect(toasts.items.at(-1)?.message).toBe('Could not insert the image'))
    err.mockRestore()
  })
})
