import { describe, expect, it } from 'vitest'
import type {
  Annotation, FreeTextAnnotation, HighlightAnnotation, ImageAnnotation, InkAnnotation, LineAnnotation, ShapeAnnotation,
  TextLineAnnotation,
} from '../../../src/core/session/model'
import { applyStyle, styleTypeOf, styleValue, swatchColor } from '../../../src/tools/select/styleTypes'

const base = { page: 0, sourceRef: null, modifiedAt: '', author: '' }

const ink = (id: string, role: 'pen' | 'marker' = 'pen'): InkAnnotation => ({
  ...base, id, kind: 'ink', strokes: [[[0, 0], [10, 10]]], color: [1, 0, 0], width: 2, opacity: 1, blend: 'normal', role,
})
const highlight = (id: string): HighlightAnnotation => ({
  ...base, id, kind: 'highlight', quads: [[0, 10, 10, 10, 0, 0, 10, 0]], color: [1, 1, 0], opacity: 0.4,
})
const textLine = (id: string, kind: 'underline' | 'strikeout'): TextLineAnnotation => ({
  ...base, id, kind, quads: [[0, 10, 10, 10, 0, 0, 10, 0]], color: [0, 0, 1],
})
const box = (id: string): FreeTextAnnotation => ({
  ...base, id, kind: 'freetext', rect: [0, 0, 100, 20], text: 'hi', lines: ['hi'], fontSize: 12,
  textColor: [0, 0, 0], background: null, align: 'left',
})
const shape = (id: string): ShapeAnnotation => ({
  ...base, id, kind: 'shape', shape: 'rect', rect: [0, 0, 50, 40], border: { color: [1, 0, 0], width: 2, opacity: 1 }, fill: null,
})
const line = (id: string): LineAnnotation => ({
  ...base, id, kind: 'line', points: [[0, 0], [30, 40]], arrow: false, border: { color: [0, 1, 0], width: 3, opacity: 1 },
})
const image = (id: string): ImageAnnotation => ({
  ...base, id, kind: 'image', rect: [0, 0, 10, 10], image: { width: 1, height: 1, png: '' },
})

describe('styleTypeOf', () => {
  it('names the controls a selection shares', () => {
    expect(styleTypeOf([ink('a'), ink('b')])).toBe('pen')
    expect(styleTypeOf([highlight('a'), ink('b', 'marker')])).toBe('marker')
    expect(styleTypeOf([textLine('a', 'underline'), textLine('b', 'strikeout')])).toBe('textline')
    expect(styleTypeOf([box('a')])).toBe('text')
    expect(styleTypeOf([shape('a')])).toBe('shape')
    expect(styleTypeOf([line('a')])).toBe('line')
  })

  it('is null for nothing, images and mixed selections', () => {
    expect(styleTypeOf([])).toBeNull()
    expect(styleTypeOf([image('a')])).toBeNull()
    expect(styleTypeOf([box('a'), shape('b')])).toBeNull()
    expect(styleTypeOf([ink('a'), ink('b', 'marker')])).toBeNull()
  })
})

describe('applyStyle', () => {
  it('changes a shape between rectangle and circle, keeping its outline', () => {
    const a = applyStyle(shape('s'), { shape: 'circle' }) as ShapeAnnotation
    expect(a.shape).toBe('circle')
    expect(a.rect).toEqual([0, 0, 50, 40])
  })

  it('turns a line\'s arrowhead on, keeping its points', () => {
    const a = applyStyle(line('l'), { arrow: true }) as LineAnnotation
    expect(a.arrow).toBe(true)
    expect(a.points).toEqual([[0, 0], [30, 40]])
  })

  it('leaves out fields the kind does not have', () => {
    const a = applyStyle(highlight('h'), { color: [0, 1, 1], opacity: 0.6, width: 20 })
    expect(a).toEqual({ ...highlight('h'), color: [0, 1, 1], opacity: 0.6 })
  })

  it('aligns a text box without touching its text or geometry', () => {
    const a = applyStyle(box('t'), { align: 'right' }) as FreeTextAnnotation
    expect(a).toEqual({ ...box('t'), align: 'right' })
  })

  it('never changes geometry, even when asked', () => {
    const a = applyStyle(shape('s'), { rect: [1, 2, 3, 4], page: 3 } as never)
    expect(a).toEqual(shape('s'))
  })

  it('returns the same object when nothing applies', () => {
    const i = image('i')
    expect(applyStyle(i, { color: [0, 0, 0] })).toBe(i)
  })

  it('copies the values it applies (annotations never share them)', () => {
    const border = { color: [0, 0, 1] as [number, number, number], width: 1, opacity: 1 }
    const a = applyStyle(line('l'), { border }) as LineAnnotation
    border.color[0] = 1
    expect(a.border.color).toEqual([0, 0, 1])
  })
})

describe('styleValue and swatchColor', () => {
  it('read the controls\' values back from an annotation', () => {
    expect(styleValue(box('t'))).toEqual({ textColor: [0, 0, 0], fontSize: 12, background: null, align: 'left' })
    expect(styleValue(ink('p'))).toEqual({ color: [1, 0, 0], width: 2, opacity: 1 })
    expect(styleValue(highlight('h'))).toEqual({ color: [1, 1, 0], opacity: 0.4 })
    expect(styleValue(line('l'))).toEqual({ arrow: false, border: { color: [0, 1, 0], width: 3, opacity: 1 } })
  })

  it('pick the colour that represents each kind', () => {
    const swatches: [Annotation, unknown][] = [
      [box('t'), [0, 0, 0]],
      [ink('p'), [1, 0, 0]],
      [shape('s'), [1, 0, 0]],
      [{ ...shape('f'), border: null, fill: { color: [0, 0, 1], opacity: 1 } }, [0, 0, 1]],
      [line('l'), [0, 1, 0]],
      [image('i'), null],
    ]
    for (const [a, c] of swatches) expect(swatchColor(a)).toEqual(c)
  })
})
