import { fireEvent, render, within } from '@testing-library/svelte'
import { describe, expect, it, vi } from 'vitest'
import type { ShapeAnnotation } from '../../../src/core/session/model'
import SelectionOptions from '../../../src/tools/select/SelectionOptions.svelte'
import Options from '../../../src/tools/shape/Options.svelte'
import { DEFAULT_FILL, type ShapeSettings } from '../../../src/tools/shape/settings'

const settings: ShapeSettings = {
  shape: 'rect',
  border: { color: [0.898, 0.224, 0.208], width: 2, opacity: 1 },
  fill: null,
}

const shape: ShapeAnnotation = {
  id: 's', page: 0, sourceRef: null, modifiedAt: '', author: '', kind: 'shape', shape: 'circle',
  rect: [0, 0, 10, 10], border: { color: [1, 0, 0], width: 2, opacity: 1 }, fill: { color: [0, 0, 1], opacity: 0.5 },
}

describe('shape tool options', () => {
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

describe('shape selection options', () => {
  it('edits border and fill of a selected shape, one step per committed change', async () => {
    const update = vi.fn()
    const r = render(SelectionOptions, { props: { annotation: shape, update } })
    const opacity = r.getByRole('slider', { name: 'Fill opacity' }) as HTMLInputElement
    opacity.value = '20'
    await fireEvent.input(opacity)
    expect(update).not.toHaveBeenCalled()
    expect(r.getByText('20%')).toBeTruthy()
    await fireEvent.change(opacity)
    expect(update).toHaveBeenCalledOnce()
    expect(update.mock.calls[0][0]).toMatchObject({ id: 's', fill: { color: [0, 0, 1], opacity: 0.2 }, border: shape.border })

    await fireEvent.click(within(r.getByRole('radiogroup', { name: 'Fill' })).getByRole('radio', { name: 'None' }))
    expect(update.mock.calls[1][0]).toMatchObject({ fill: null, border: shape.border })
  })

  it("turning a selected shape's fill off and on again restores its fill, also after the flyout reopens", async () => {
    const update = vi.fn()
    const first = render(SelectionOptions, { props: { annotation: shape, update } })
    await fireEvent.click(within(first.getByRole('radiogroup', { name: 'Fill' })).getByRole('radio', { name: 'None' }))
    expect(update.mock.lastCall![0]).toMatchObject({ fill: null })
    first.unmount()
    const r = render(SelectionOptions, { props: { annotation: { ...shape, fill: null }, update } })
    await fireEvent.click(within(r.getByRole('radiogroup', { name: 'Fill' })).getByRole('radio', { name: 'Fill' }))
    expect(update.mock.lastCall![0]).toMatchObject({ fill: shape.fill, border: shape.border })
    // Another shape does not get this one's fill.
    r.unmount()
    const other = render(SelectionOptions, { props: { annotation: { ...shape, id: 'other', fill: null }, update } })
    await fireEvent.click(within(other.getByRole('radiogroup', { name: 'Fill' })).getByRole('radio', { name: 'Fill' }))
    expect(update.mock.lastCall![0]).toMatchObject({ fill: DEFAULT_FILL })
  })
})
