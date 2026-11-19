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
    expect(update).toHaveBeenLastCalledWith({ border: null, fill: DEFAULT_FILL })
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
})
