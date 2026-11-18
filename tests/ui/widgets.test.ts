import { fireEvent, render } from '@testing-library/svelte'
import { describe, expect, it, vi } from 'vitest'
import Segmented from '../../src/ui/Segmented.svelte'
import Slider from '../../src/ui/Slider.svelte'

describe('Slider', () => {
  it('shows the formatted value and emits numbers', async () => {
    const onchange = vi.fn()
    const { getByRole, getByText } = render(Slider, {
      props: { label: 'Opacity', min: 0.1, max: 1, step: 0.05, value: 0.4, format: (v: number) => `${Math.round(v * 100)} %`, onchange },
    })
    expect(getByText('40 %')).toBeTruthy()
    await fireEvent.input(getByRole('slider', { name: 'Opacity' }), { target: { value: '0.75' } })
    expect(onchange).toHaveBeenCalledWith(0.75)
  })
})

describe('Segmented', () => {
  it('marks the current option and emits the chosen value', async () => {
    const onchange = vi.fn()
    const { getAllByRole } = render(Segmented, {
      props: { label: 'Mode', options: [{ value: 'text', label: 'Text' }, { value: 'free', label: 'Freehand' }], value: 'text', onchange },
    })
    const radios = getAllByRole('radio')
    expect(radios.map((r) => r.getAttribute('aria-checked'))).toEqual(['true', 'false'])
    await fireEvent.click(radios[1])
    expect(onchange).toHaveBeenCalledWith('free')
  })
})
