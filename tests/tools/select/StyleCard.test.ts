import { fireEvent, render, within } from '@testing-library/svelte'
import { describe, expect, it, vi } from 'vitest'
import type {
  FreeTextAnnotation, HighlightAnnotation, InkAnnotation, LineAnnotation, ShapeAnnotation,
} from '../../../src/core/session/model'
import StyleCard from '../../../src/tools/select/StyleCard.svelte'
import { DEFAULT_FILL } from '../../../src/tools/shape/settings'

const base = { page: 0, sourceRef: null, modifiedAt: '', author: '' }
const box: FreeTextAnnotation = {
  ...base, id: 't', kind: 'freetext', rect: [0, 0, 100, 20], text: 'hi', lines: ['hi'], fontSize: 12,
  textColor: [0, 0, 0], background: null, align: 'left',
}
const pen = (id: string, color: [number, number, number]): InkAnnotation => ({
  ...base, id, kind: 'ink', strokes: [[[0, 0], [10, 10]]], color, width: 2, opacity: 1, blend: 'normal', role: 'pen',
})
const hl: HighlightAnnotation = {
  ...base, id: 'h', kind: 'highlight', quads: [[0, 10, 10, 10, 0, 0, 10, 0]], color: [1, 1, 0], opacity: 0.4,
}
const shape: ShapeAnnotation = {
  ...base, id: 's', kind: 'shape', shape: 'rect', rect: [0, 0, 50, 40],
  border: { color: [1, 0, 0], width: 2, opacity: 1 }, fill: { color: [0, 0, 1], opacity: 1 },
}
const line: LineAnnotation = {
  ...base, id: 'l', kind: 'line', points: [[0, 0], [30, 40]], arrow: false, border: { color: [0, 1, 0], width: 3, opacity: 1 },
}

function mount(annotations: unknown[], extra: Record<string, unknown> = {}) {
  const onlive = vi.fn()
  const oncommit = vi.fn()
  const r = render(StyleCard, { props: { annotations, onlive, oncommit, ...extra } })
  return { ...r, onlive, oncommit }
}

describe('StyleCard', () => {
  it('a text box gets the text tool\'s controls, alignment included', async () => {
    const r = mount([box])
    expect((r.getByRole('slider', { name: 'Font size' }) as HTMLInputElement).min).toBe('6')
    expect(r.getByRole('region', { name: 'Background' })).toBeTruthy()
    await fireEvent.click(within(r.getByRole('region', { name: 'Alignment' })).getByRole('radio', { name: 'Centre' }))
    expect(r.oncommit).toHaveBeenCalledWith([{ ...box, align: 'center' }])
  })

  it('previews slider drags live and commits once on release', async () => {
    const r = mount([hl])
    const slider = r.getByRole('slider', { name: 'Opacity' }) as HTMLInputElement
    slider.value = '70'
    await fireEvent.input(slider)
    expect(r.oncommit).not.toHaveBeenCalled()
    expect(r.onlive).toHaveBeenLastCalledWith([{ ...hl, opacity: 0.7 }])
    expect(r.getByText('70%')).toBeTruthy()
    await fireEvent.change(slider)
    expect(r.oncommit).toHaveBeenCalledOnce()
    expect(r.oncommit).toHaveBeenCalledWith([{ ...hl, opacity: 0.7 }])
  })

  it('lays out text boxes while the font size is dragged', async () => {
    const relayout = vi.fn((a: FreeTextAnnotation) => ({ ...a, lines: ['h', 'i'] }))
    const r = mount([box], { relayout })
    const slider = r.getByRole('slider', { name: 'Font size' }) as HTMLInputElement
    slider.value = '30'
    await fireEvent.input(slider)
    expect(r.onlive).toHaveBeenLastCalledWith([{ ...box, fontSize: 30, lines: ['h', 'i'] }])
  })

  it('edits a group: each element keeps the fields that were not changed', async () => {
    const a = pen('a', [1, 0, 0])
    const b = pen('b', [0, 0, 1])
    const r = mount([a, b])
    const width = r.getByRole('slider', { name: 'Width' }) as HTMLInputElement
    width.value = '6'
    await fireEvent.change(width)
    expect(r.oncommit).toHaveBeenCalledWith([{ ...a, width: 6 }, { ...b, width: 6 }])
  })

  it('switches a shape between rectangle and circle', async () => {
    const r = mount([shape])
    await fireEvent.click(r.getByRole('radio', { name: 'Circle' }))
    expect(r.oncommit).toHaveBeenCalledWith([{ ...shape, shape: 'circle' }])
  })

  it('turns a line\'s arrowhead on', async () => {
    const r = mount([line])
    await fireEvent.click(within(r.getByRole('radiogroup', { name: 'Line end' })).getByRole('radio', { name: 'Arrow' }))
    expect(r.oncommit).toHaveBeenCalledWith([{ ...line, arrow: true }])
  })

  it('turning a shape\'s fill off and on again restores it, also after the card reopens', async () => {
    const first = mount([shape])
    await fireEvent.click(within(first.getByRole('radiogroup', { name: 'Fill' })).getByRole('radio', { name: 'None' }))
    expect(first.oncommit.mock.lastCall![0][0]).toMatchObject({ fill: null })
    first.unmount()
    const r = mount([{ ...shape, fill: null }])
    await fireEvent.click(within(r.getByRole('radiogroup', { name: 'Fill' })).getByRole('radio', { name: 'Fill' }))
    expect(r.oncommit.mock.lastCall![0][0]).toMatchObject({ fill: shape.fill, border: shape.border })
    r.unmount()
    // Another shape does not get this one's fill.
    const other = mount([{ ...shape, id: 'other', fill: null }])
    await fireEvent.click(within(other.getByRole('radiogroup', { name: 'Fill' })).getByRole('radio', { name: 'Fill' }))
    expect(other.oncommit.mock.lastCall![0][0]).toMatchObject({ fill: DEFAULT_FILL })
  })

  it('drops a live preview when the selection changes', async () => {
    const r = mount([hl])
    const slider = r.getByRole('slider', { name: 'Opacity' }) as HTMLInputElement
    slider.value = '70'
    await fireEvent.input(slider)
    await r.rerender({ annotations: [{ ...hl, id: 'other' }] })
    expect(r.onlive).toHaveBeenLastCalledWith(null)
    expect(r.getByText('40%')).toBeTruthy()
  })
})
