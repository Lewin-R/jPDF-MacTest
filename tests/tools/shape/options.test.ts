import { fireEvent, render, within } from '@testing-library/svelte'
import { describe, expect, it, vi } from 'vitest'
import Options from '../../../src/tools/shape/Options.svelte'
import { DEFAULT_FILL, type ShapeSettings } from '../../../src/tools/shape/settings'

const settings: ShapeSettings = {
  shape: 'rect',
  border: { color: [0.898, 0.224, 0.208], width: 2, opacity: 1 },
  fill: null,
}

describe('shape tool options', () => {
  it('puts border and fill under their own titles, visible while turned off', () => {
    const r = render(Options, { props: { settings, update: vi.fn() } })
    const border = r.getByRole('region', { name: 'Border' })
    expect(within(border).getByRole('slider', { name: 'Border width' })).toBeTruthy()
    // The fill is off: its section and toggle are still there, its controls not.
    const fill = r.getByRole('region', { name: 'Fill' })
    expect(within(fill).getByRole('radiogroup', { name: 'Fill' })).toBeTruthy()
    expect(within(fill).queryByRole('slider')).toBeNull()
  })

  it('lines get a "Line" section and no fill', () => {
    const r = render(Options, { props: { settings: { ...settings, shape: 'arrow' }, update: vi.fn() } })
    expect(within(r.getByRole('region', { name: 'Line' })).getByRole('slider', { name: 'Line width' })).toBeTruthy()
    expect(r.queryByRole('region', { name: 'Fill' })).toBeNull()
  })

  it('switches between Rectangle and Circle', async () => {
    const update = vi.fn()
    const r = render(Options, { props: { settings, update } })
    await fireEvent.click(within(r.getByRole('radiogroup', { name: 'Shape' })).getByRole('radio', { name: 'Circle' }))
    expect(update).toHaveBeenCalledWith({ shape: 'circle' })
  })

  it('turning off the only border turns the fill on', async () => {
    const update = vi.fn()
    const r = render(Options, { props: { settings, update } })
    expect(r.getByRole('slider', { name: 'Border width' })).toBeTruthy()
    expect(r.queryByRole('slider', { name: 'Fill opacity' })).toBeNull()
    await fireEvent.click(within(r.getByRole('radiogroup', { name: 'Border' })).getByRole('radio', { name: 'None' }))
    expect(update).toHaveBeenLastCalledWith({ border: null, fill: DEFAULT_FILL, lastBorder: settings.border })
  })

  it('turning the border off and on again restores the custom border', async () => {
    const custom = { color: [0, 0.5, 0] as [number, number, number], width: 7.5, opacity: 0.3 }
    const fill = { color: [0, 0, 1] as [number, number, number], opacity: 0.5 }
    const update = vi.fn()
    const r = render(Options, { props: { settings: { shape: 'rect', border: custom, fill }, update } })
    await fireEvent.click(within(r.getByRole('radiogroup', { name: 'Border' })).getByRole('radio', { name: 'None' }))
    const off = update.mock.lastCall![0]
    expect(off).toEqual({ border: null, fill, lastBorder: custom })
    await r.rerender({ settings: { shape: 'rect', ...off }, update })
    await fireEvent.click(within(r.getByRole('radiogroup', { name: 'Border' })).getByRole('radio', { name: 'Border' }))
    expect(update.mock.lastCall![0]).toMatchObject({ border: custom, fill })
  })

  it('the fill turned on by the border rule is the last custom fill', async () => {
    const lastFill = { color: [0, 1, 0] as [number, number, number], opacity: 0.8 }
    const update = vi.fn()
    const r = render(Options, { props: { settings: { ...settings, lastFill }, update } })
    await fireEvent.click(within(r.getByRole('radiogroup', { name: 'Border' })).getByRole('radio', { name: 'None' }))
    expect(update.mock.lastCall![0]).toMatchObject({ border: null, fill: lastFill })
  })

  it('width slider updates the border', async () => {
    const update = vi.fn()
    const r = render(Options, { props: { settings, update } })
    const slider = r.getByRole('slider', { name: 'Border width' }) as HTMLInputElement
    slider.value = '5.5'
    await fireEvent.input(slider)
    expect(update).toHaveBeenLastCalledWith({ border: { ...settings.border, width: 5.5 }, fill: null })
  })
})
