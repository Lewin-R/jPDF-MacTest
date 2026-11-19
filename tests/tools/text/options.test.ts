import { fireEvent, render, within } from '@testing-library/svelte'
import { describe, expect, it, vi } from 'vitest'
import type { FreeTextAnnotation } from '../../../src/core/session/model'
import SelectionOptions from '../../../src/tools/select/SelectionOptions.svelte'
import Options from '../../../src/tools/text/Options.svelte'
import { FONT_SIZE_MAX, FONT_SIZE_MIN, type TextSettings } from '../../../src/tools/text/settings'

const settings: TextSettings = { textColor: [0, 0, 0], fontSize: 12, background: null }

const box: FreeTextAnnotation = {
  id: 't', page: 0, sourceRef: null, modifiedAt: '', author: '', kind: 'freetext',
  rect: [0, 0, 100, 20], text: 'hi', lines: ['hi'], fontSize: 12, textColor: [0, 0, 0], background: null, align: 'left',
}

describe('text tool options', () => {
  it('font sizes go down to 6 pt', () => {
    expect(FONT_SIZE_MIN).toBe(6)
    const r = render(Options, { props: { settings, update: vi.fn() } })
    const slider = r.getByRole('slider', { name: 'Font size' }) as HTMLInputElement
    expect(slider.min).toBe(String(FONT_SIZE_MIN))
    expect(slider.max).toBe(String(FONT_SIZE_MAX))
  })

  it('groups the background settings under a "Background" title', () => {
    const r = render(Options, { props: { settings: { ...settings, background: { color: [1, 1, 0], opacity: 1 } }, update: vi.fn() } })
    const section = r.getByRole('region', { name: 'Background' })
    expect(within(section).getByRole('radiogroup', { name: 'Background' })).toBeTruthy()
    expect(within(section).getByRole('slider', { name: 'Background opacity' })).toBeTruthy()
    // The font controls stay above it.
    expect(within(section).queryByRole('slider', { name: 'Font size' })).toBeNull()
  })

  it('the title stays while the background is transparent', () => {
    const r = render(Options, { props: { settings, update: vi.fn() } })
    expect(r.getByRole('heading', { name: 'Background' })).toBeTruthy()
  })
})

describe('text alignment option', () => {
  it('sits in its own "Alignment" section below the background', () => {
    const r = render(Options, { props: { settings, update: vi.fn() } })
    const headings = r.getAllByRole('heading').map((h) => h.textContent)
    expect(headings).toEqual(['Background', 'Alignment'])
    const section = r.getByRole('region', { name: 'Alignment' })
    const group = within(section).getByRole('radiogroup', { name: 'Alignment' })
    expect(within(group).getAllByRole('radio').map((b) => b.textContent?.trim())).toEqual(['Left', 'Centre', 'Right'])
  })

  it('is left for settings saved before alignment existed', () => {
    const r = render(Options, { props: { settings, update: vi.fn() } })
    expect(r.getByRole('radio', { name: 'Left' }).getAttribute('aria-checked')).toBe('true')
  })

  it('updates the tool settings', async () => {
    const update = vi.fn()
    const r = render(Options, { props: { settings, update } })
    await fireEvent.click(r.getByRole('radio', { name: 'Right' }))
    expect(update).toHaveBeenCalledWith({ align: 'right' })
  })
})

describe('selected text box options', () => {
  it('match the tool: 6 pt minimum and a Background section', () => {
    const r = render(SelectionOptions, { props: { annotation: box, update: vi.fn() } })
    expect((r.getByRole('slider', { name: 'Font size' }) as HTMLInputElement).min).toBe('6')
    expect(r.getByRole('region', { name: 'Background' })).toBeTruthy()
  })
})
