import { render } from '@testing-library/svelte'
import { describe, expect, it } from 'vitest'
import MarkerIcon from '../../src/tools/marker/Icon.svelte'
import PenIcon from '../../src/tools/pen/Icon.svelte'
import ShapeIcon from '../../src/tools/shape/Icon.svelte'
import type { ShapeSettings } from '../../src/tools/shape/settings'
import TextIcon from '../../src/tools/text/Icon.svelte'
import { iconOpacity, iconStrokeWidth } from '../../src/tools/shared/iconStyle'
import { isDark, prefersDarkInk } from '../../src/ui/color'

const red = { color: [1, 0, 0] as [number, number, number], width: 2, opacity: 1 }
const blueFill = { color: [0, 0, 1] as [number, number, number], opacity: 0.5 }

function shape(settings: ShapeSettings) {
  const { container } = render(ShapeIcon, { props: { settings, size: 20 } })
  return { svg: container.querySelector('svg')!, g: container.querySelector('g')! }
}

describe('icon style helpers', () => {
  it('keeps stroke widths and opacities legible', () => {
    expect(iconStrokeWidth(0.5)).toBe(1.25)
    expect(iconStrokeWidth(2)).toBeCloseTo(1.7)
    expect(iconStrokeWidth(20)).toBe(4)
    expect(iconOpacity(0)).toBe(0.2)
    expect(iconOpacity(0.6)).toBe(0.6)
  })

  it('tells dark colours from light ones', () => {
    expect(isDark([0, 0, 0])).toBe(true)
    expect(isDark([0.1, 0.1, 0.1])).toBe(true)
    expect(isDark([1, 0.922, 0.231])).toBe(false)
  })

  it('picks the ink that contrasts better with a blended colour', () => {
    const black: [number, number, number] = [0, 0, 0]
    expect(prefersDarkInk([1, 1, 1], 1, black)).toBe(true)
    expect(prefersDarkInk([1, 1, 1], 0.1, black)).toBe(false)
    expect(prefersDarkInk([0, 0, 1], 1, black)).toBe(false)
  })
})

describe('shape icon', () => {
  it('draws the current shape', () => {
    const cases: [ShapeSettings['shape'], string][] = [
      ['rect', 'rect'], ['circle', 'circle'], ['line', 'line'], ['arrow', 'path'], ['polyline', 'polyline'],
    ]
    for (const [kind, tag] of cases) {
      const { g } = shape({ shape: kind, border: red, fill: null })
      expect(g.firstElementChild?.tagName, kind).toBe(tag)
    }
  })

  it('shows border colour, width and opacity and the fill', () => {
    const { g } = shape({ shape: 'rect', border: { ...red, width: 6, opacity: 0.5 }, fill: blueFill })
    expect(g.getAttribute('stroke')).toBe('#ff0000')
    expect(Number(g.getAttribute('stroke-width'))).toBeCloseTo(3.1)
    expect(g.getAttribute('stroke-opacity')).toBe('0.5')
    expect(g.getAttribute('fill')).toBe('#0000ff')
    expect(g.getAttribute('fill-opacity')).toBe('0.5')
  })

  it('outlines a shape without border with a dashed line', () => {
    const { g } = shape({ shape: 'circle', border: null, fill: blueFill })
    expect(g.getAttribute('stroke')).toBe('currentColor')
    expect(g.getAttribute('stroke-dasharray')).toBe('2 2')
  })

  it('lines use the remembered border and no fill', () => {
    const { g } = shape({ shape: 'line', border: null, fill: blueFill, lastBorder: red })
    expect(g.getAttribute('stroke')).toBe('#ff0000')
    expect(g.getAttribute('fill')).toBe('none')
    expect(g.hasAttribute('stroke-dasharray')).toBe(false)
  })

  it('adds a halo to dark colours', () => {
    expect(shape({ shape: 'rect', border: { ...red, color: [0, 0, 0] }, fill: null }).g.classList).toContain('dark')
    expect(shape({ shape: 'rect', border: red, fill: null }).g.classList).not.toContain('dark')
  })
})

describe('marker icon', () => {
  const base = { color: [1, 0.922, 0.231] as [number, number, number], opacity: 0.6, width: 14 }

  it('text mode: a highlighted "T" in the colour and opacity', () => {
    const { container } = render(MarkerIcon, { props: { settings: { ...base, mode: 'text' }, size: 20 } })
    expect(container.querySelector('svg')!.dataset.mode).toBe('text')
    const band = container.querySelector('.band')!
    expect(band.getAttribute('fill')).toBe('#ffeb3b')
    expect(band.getAttribute('fill-opacity')).toBe('0.6')
    expect(container.querySelector('.glyph')).toBeTruthy()
  })

  it('text mode: the "T" is dark on a bright band, light on a faint one', () => {
    const ink = (opacity: number) => {
      const { container } = render(MarkerIcon, { props: { settings: { ...base, mode: 'text', opacity }, size: 20 } })
      return container.querySelector('.glyph')!.classList.contains('ink-dark')
    }
    expect(ink(1)).toBe(true)
    expect(ink(0.4)).toBe(false)
  })

  it('freehand mode: the marker pen', () => {
    const { container } = render(MarkerIcon, { props: { settings: { ...base, mode: 'freehand' }, size: 20 } })
    expect(container.querySelector('svg')!.dataset.mode).toBe('freehand')
    expect(container.querySelector('.band')).toBeNull()
    expect(container.querySelector('g')!.getAttribute('stroke')).toBe('#ffeb3b')
  })
})

describe('pen icon', () => {
  it('the drawn line shows width and opacity', () => {
    const { container } = render(PenIcon, { props: { settings: { color: [1, 0, 0], width: 20, opacity: 0.4 }, size: 20 } })
    const line = container.querySelector('.stroke')!
    expect(line.getAttribute('stroke-width')).toBe('3.5')
    expect(line.getAttribute('stroke-opacity')).toBe('0.4')
    expect(container.querySelector('svg')!.getAttribute('stroke')).toBe('#ff0000')
  })
})

describe('text icon', () => {
  it('shows the font size (rounded, no unit) and a plus in the text colour', () => {
    const { container } = render(TextIcon, {
      props: { settings: { textColor: [1, 0, 0], fontSize: 14.4, background: null }, size: 20 },
    })
    const label = container.querySelector('.size')!
    expect(label.textContent).toBe('14')
    expect(label.getAttribute('fill')).toBe('#ff0000')
    expect(container.querySelector('.plus')!.getAttribute('stroke')).toBe('#ff0000')
  })

  it('narrows two-digit sizes to fit, leaves one digit alone', () => {
    const at = (fontSize: number) =>
      render(TextIcon, { props: { settings: { textColor: [1, 0, 0], fontSize, background: null }, size: 20 } })
        .container.querySelector('.size')!
    expect(at(72).getAttribute('textLength')).toBe('16')
    expect(at(8).hasAttribute('textLength')).toBe(false)
  })

  it('shows the background box only when there is one', () => {
    const plain = render(TextIcon, { props: { settings: { textColor: [1, 0, 0], fontSize: 12, background: null }, size: 20 } })
    expect(plain.container.querySelector('.background')).toBeNull()

    const boxed = render(TextIcon, {
      props: { settings: { textColor: [0, 0, 0], fontSize: 12, background: { color: [1, 1, 0], opacity: 0.5 } }, size: 20 },
    })
    const bg = boxed.container.querySelector('.background')!
    expect(bg.getAttribute('fill')).toBe('#ffff00')
    expect(bg.getAttribute('fill-opacity')).toBe('0.5')
    // Dark text on a light background needs no halo.
    expect(boxed.container.querySelector('.glyph')!.classList).not.toContain('dark')
  })

  it('dark text without a light background gets a halo', () => {
    const r = render(TextIcon, {
      props: { settings: { textColor: [0, 0, 0], fontSize: 12, background: { color: [1, 1, 0], opacity: 0.2 } }, size: 20 },
    })
    expect(r.container.querySelector('.glyph')!.classList).toContain('dark')
  })
})
