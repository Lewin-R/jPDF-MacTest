import { fireEvent, render } from '@testing-library/svelte'
import { describe, expect, it, vi } from 'vitest'
import ColorPicker from '../../src/ui/ColorPicker.svelte'
import { hexToRgb, rgbToHex } from '../../src/ui/color'
import type { RGB } from '../../src/core/session/model'

const presets: RGB[] = [[1, 0.922, 0.231], [0, 0, 1], [0.1, 0.1, 0.1]]

describe('ColorPicker', () => {
  it('clicking preset emits its RGB', async () => {
    const onchange = vi.fn()
    const { getAllByRole } = render(ColorPicker, { props: { value: presets[0], presets, onchange } })
    const swatches = getAllByRole('radio')
    expect(swatches).toHaveLength(3)
    await fireEvent.click(swatches[1])
    expect(onchange).toHaveBeenCalledWith([0, 0, 1])
  })

  it('marks the preset matching the value as checked', () => {
    const { getAllByRole } = render(ColorPicker, { props: { value: [0, 0, 1], presets, onchange: () => {} } })
    expect(getAllByRole('radio').map((r) => r.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false'])
  })

  it('custom hex #ff0000 emits [1,0,0]', async () => {
    const onchange = vi.fn()
    const { getByLabelText } = render(ColorPicker, { props: { value: presets[0], presets, onchange } })
    const input = getByLabelText('Custom colour') as HTMLInputElement
    expect(input.type).toBe('color')
    await fireEvent.input(input, { target: { value: '#ff0000' } })
    expect(onchange).toHaveBeenCalledWith([1, 0, 0])
  })
})

describe('hex <-> RGB', () => {
  it('converts both ways', () => {
    expect(hexToRgb('#ff0000')).toEqual([1, 0, 0])
    expect(hexToRgb('#FFFFFF')).toEqual([1, 1, 1])
    expect(rgbToHex([1, 0.922, 0.231])).toBe('#ffeb3b')
    expect(rgbToHex([0, 0.5, 1])).toBe('#0080ff')
  })

  it('clamps out-of-range channels and rejects bad hex', () => {
    expect(rgbToHex([2, -1, 0])).toBe('#ff0000')
    expect(hexToRgb('red')).toBeNull()
    expect(hexToRgb('#12345')).toBeNull()
  })

  it('round-trips through hex', () => {
    expect(hexToRgb(rgbToHex([0.2, 0.4, 0.6]))).toEqual([0.2, 0.4, 0.6])
  })
})
