import { render } from '@testing-library/svelte'
import { describe, expect, it } from 'vitest'
import type { PageViewport } from 'pdfjs-dist'
import '../../src/annotations'
import { strikeoutKind, underlineKind } from '../../src/annotations/textline'
import { annotationKinds } from '../../src/core/registry/annotationKinds'
import type { TextLineAnnotation } from '../../src/core/session/model'
import { AnnotationStore } from '../../src/core/session/store.svelte'
import Overlay from '../../src/core/viewer/Overlay.svelte'

const line = (over: Partial<TextLineAnnotation> = {}): TextLineAnnotation => ({
  id: 'u1', page: 0, sourceRef: null, modifiedAt: '', author: '', kind: 'underline',
  quads: [
    [10, 94, 50, 94, 10, 80, 50, 80],
    [10, 74, 30, 74, 10, 60, 30, 60],
  ],
  color: [1, 0, 0], ...over,
})

// Page 100pt tall, scale 2: screen = (2x, 2(100 - y)).
const vp = {
  scale: 2,
  width: 200,
  height: 200,
  convertToViewportPoint: (x: number, y: number) => [x * 2, (100 - y) * 2],
} as unknown as PageViewport

describe('underline / strike-out kinds', () => {
  it('are registered', () => {
    expect(annotationKinds.get('underline')).toBe(underlineKind)
    expect(annotationKinds.get('strikeout')).toBe(strikeoutKind)
  })

  it('render all lines as one filled path', () => {
    const store = new AnnotationStore()
    store.add(line())
    const { container } = render(Overlay, { props: { pageNumber: 1, scale: 2, store, viewport: vp } })
    const paths = container.querySelectorAll('path')
    expect(paths).toHaveLength(1)
    expect(paths[0].getAttribute('fill')).toBe('rgb(255,0,0)')
    // First quad: 14pt tall, 1pt band from y=81.18 to 82.18 → screen y 35.64..37.64.
    const d = paths[0].getAttribute('d')!
    expect(d.match(/M/g)).toHaveLength(2)
    const nums = d.split(/[MLZ ]+/).filter(Boolean).map(Number).slice(0, 8)
    ;[20, 35.64, 100, 35.64, 100, 37.64, 20, 37.64].forEach((v, i) => expect(nums[i]).toBeCloseTo(v, 6))
  })

  it('bounds, hit test and translate work on the text quads', () => {
    const a = line({ kind: 'strikeout' })
    expect(strikeoutKind.bounds(a)).toEqual([10, 60, 50, 94])
    // Anywhere on the line box hits, not only the thin line.
    expect(strikeoutKind.hitTest(a, [20, 92], 0)).toBe(true)
    expect(strikeoutKind.hitTest(a, [40, 65], 0)).toBe(false)
    expect(strikeoutKind.hitTest(a, [52, 85], 3)).toBe(true)
    const moved = strikeoutKind.translate(a, 5, -2)
    expect(moved.quads[0]).toEqual([15, 92, 55, 92, 15, 78, 55, 78])
    expect(moved.kind).toBe('strikeout')
  })
})
