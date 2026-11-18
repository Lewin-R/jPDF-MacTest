import { render } from '@testing-library/svelte'
import { describe, expect, it, vi } from 'vitest'
import type { PageViewport } from 'pdfjs-dist'
import '../../src/annotations'
import { inkKind } from '../../src/annotations/ink'
import { annotationKinds } from '../../src/core/registry/annotationKinds'
import type { InkAnnotation } from '../../src/core/session/model'
import { AnnotationStore } from '../../src/core/session/store.svelte'
import Overlay from '../../src/core/viewer/Overlay.svelte'

const ink = (over: Partial<InkAnnotation> = {}): InkAnnotation => ({
  id: 'a1', page: 0, sourceRef: null, modifiedAt: '', author: '', kind: 'ink',
  strokes: [[[0, 0], [10, 0], [20, 10]]], color: [1, 0, 0], width: 4, opacity: 0.5,
  blend: 'normal', role: 'pen', ...over,
})

// Page 100pt tall, scale 2: screen = (2x, 2(100 - y)).
const vp = {
  scale: 2,
  width: 200,
  height: 200,
  convertToViewportPoint: (x: number, y: number) => [x * 2, (100 - y) * 2],
} as unknown as PageViewport

function mount(page: number, store: AnnotationStore) {
  return render(Overlay, { props: { pageNumber: page, scale: 2, store, viewport: vp } })
}

describe('Overlay + ink', () => {
  it('renders ink as a path with scaled width and opacity', () => {
    const store = new AnnotationStore()
    store.add(ink())
    const { container } = mount(1, store)
    const path = container.querySelector('path')!
    expect(path.getAttribute('d')).toBe('M0 200 Q20 200 30 190 L40 180')
    expect(path.getAttribute('stroke-width')).toBe('8')
    expect(path.getAttribute('stroke-opacity')).toBe('0.5')
    expect(path.getAttribute('stroke')).toBe('rgb(255,0,0)')
    expect(path.getAttribute('stroke-linecap')).toBe('round')
    expect(container.querySelector('g')!.style.mixBlendMode).toBe('')
  })

  it('multiplies marker ink', () => {
    const store = new AnnotationStore()
    store.add(ink({ role: 'marker', blend: 'multiply' }))
    const { container } = mount(1, store)
    expect(container.querySelector('g')!.style.mixBlendMode).toBe('multiply')
  })

  it('blend is authoritative for multiply', () => {
    const a = new AnnotationStore()
    a.add(ink({ role: 'marker', blend: 'normal' }))
    expect(mount(1, a).container.querySelector('g')!.style.mixBlendMode).toBe('')
    const b = new AnnotationStore()
    b.add(ink({ role: 'pen', blend: 'multiply' }))
    expect(mount(1, b).container.querySelector('g')!.style.mixBlendMode).toBe('multiply')
  })

  it('sizes the SVG viewBox to the viewport so stale content scales', () => {
    const { container } = mount(1, new AnnotationStore())
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('viewBox')).toBe('0 0 200 200')
    expect(svg.getAttribute('preserveAspectRatio')).toBe('none')
  })

  it('logs getPage failures unless destroyed', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const doc = { destroyed: false, getPage: vi.fn(() => Promise.reject(new Error('boom'))) }
    render(Overlay, { props: { doc: doc as never, pageNumber: 1, scale: 1, store: new AnnotationStore() } })
    await vi.waitFor(() => expect(err).toHaveBeenCalledOnce())
    err.mockRestore()
  })

  it('renders the 0-based store page for a 1-based page number', () => {
    const store = new AnnotationStore()
    store.add(ink({ id: 'p0', page: 0 }))
    store.add(ink({ id: 'p1', page: 1 }))
    expect(mount(1, store).container.querySelectorAll('path')).toHaveLength(1)
    expect(mount(2, store).container.querySelectorAll('path')).toHaveLength(1)
    expect(mount(3, store).container.querySelectorAll('path')).toHaveLength(0)
  })
})

describe('ink kind geometry', () => {
  it('registers at import', () => {
    expect(annotationKinds.get('ink')).toBe(inkKind)
    expect(() => annotationKinds.get('nope')).toThrow()
  })
  it('hitTest uses segment distance within width/2 + tolerance', () => {
    const a = ink()
    expect(inkKind.hitTest(a, [5, 2], 0)).toBe(true) // width 4 -> 2pt
    expect(inkKind.hitTest(a, [5, 3], 0)).toBe(false)
    expect(inkKind.hitTest(a, [5, 3], 1)).toBe(true)
  })
  it('hitTest handles single-point strokes', () => {
    const a = ink({ strokes: [[[10, 10]]] })
    expect(inkKind.hitTest(a, [11, 10], 0)).toBe(true)
    expect(inkKind.hitTest(a, [13, 10], 0)).toBe(false)
  })
  it('bounds, translate and scale', () => {
    const a = ink()
    expect(inkKind.bounds(a)).toEqual([-2, -2, 22, 12])
    expect(inkKind.translate(a, 1, 2).strokes[0][0]).toEqual([1, 2])
    expect(inkKind.scale!(a, [0, 0, 20, 10], [0, 0, 40, 10]).strokes[0][2]).toEqual([40, 10])
  })
})
