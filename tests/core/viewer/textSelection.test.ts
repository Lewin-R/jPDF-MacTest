import { fireEvent, render } from '@testing-library/svelte'
import type { PageViewport, PDFPageProxy } from 'pdfjs-dist'
import { describe, expect, it, vi } from 'vitest'
import type { ToolHandler } from '../../../src/core/registry/tools'
import { AnnotationStore } from '../../../src/core/session/store.svelte'
import Overlay from '../../../src/core/viewer/Overlay.svelte'
import { pageHasText } from '../../../src/core/viewer/textContent'
import { clientToPdf } from '../../../src/core/viewer/viewerMath'

const vp = {
  scale: 2,
  width: 200,
  height: 200,
  convertToViewportPoint: (x: number, y: number) => [x * 2, (100 - y) * 2],
  convertToPdfPoint: (x: number, y: number) => [x / 2, 100 - y / 2],
} as unknown as PageViewport

function fakePage(strs: string[]) {
  return {
    getViewport: () => vp,
    getTextContent: vi.fn(async () => ({ items: strs.map((str) => ({ str })), styles: {} })),
  }
}

function docWith(page: ReturnType<typeof fakePage>) {
  return { numPages: 1, destroyed: false, getPage: async () => page } as never
}

function textTool(selecting: boolean) {
  const onPointerDown = vi.fn()
  const tool: ToolHandler = { onPointerDown, textSelection: () => (selecting ? { color: [1, 1, 0] } : null) }
  return { tool, onPointerDown }
}

function mount(page: ReturnType<typeof fakePage>, tool: ToolHandler) {
  const r = render(Overlay, { props: { doc: docWith(page), pageNumber: 1, scale: 2, store: new AnnotationStore(), tool } })
  const svg = r.container.querySelector('svg')!
  svg.setPointerCapture = vi.fn()
  return svg
}

describe('pageHasText', () => {
  it('is true only for non-whitespace text, and fetches text content once per page', async () => {
    const text = fakePage(['  ', 'Lecture 3'])
    expect(await pageHasText(text as unknown as PDFPageProxy)).toBe(true)
    expect(await pageHasText(text as unknown as PDFPageProxy)).toBe(true)
    expect(text.getTextContent).toHaveBeenCalledOnce()
    expect(await pageHasText(fakePage([' ', '\n']) as unknown as PDFPageProxy)).toBe(false)
    expect(await pageHasText(fakePage([]) as unknown as PDFPageProxy)).toBe(false)
  })
})

describe('clientToPdf', () => {
  it('maps through the viewport, compensating a CSS-scaled box', () => {
    expect(clientToPdf(30, 60, { left: 10, top: 20, width: 200, height: 200 }, vp)).toEqual([10, 80])
    // Box shown at half size (zoom preview): client offsets count double.
    expect(clientToPdf(20, 40, { left: 10, top: 20, width: 100, height: 100 }, vp)).toEqual([10, 80])
  })
})

describe('Overlay with a text-selecting tool', () => {
  it('lets pointer input through to the text layer on pages with text', async () => {
    const { tool, onPointerDown } = textTool(true)
    const svg = mount(fakePage(['Hello']), tool)
    await vi.waitFor(() => expect(svg.getAttribute('viewBox')).toBe('0 0 200 200'))
    expect(svg.classList.contains('interactive')).toBe(false)
    await fireEvent.pointerDown(svg, { button: 0, clientX: 5, clientY: 5, pointerId: 1 })
    expect(onPointerDown).not.toHaveBeenCalled()
  })

  it('takes pointer input on pages without text (freehand fallback)', async () => {
    const { tool, onPointerDown } = textTool(true)
    const svg = mount(fakePage([]), tool)
    await vi.waitFor(() => expect(svg.classList.contains('interactive')).toBe(true))
    await fireEvent.pointerDown(svg, { button: 0, clientX: 5, clientY: 5, pointerId: 1 })
    expect(onPointerDown).toHaveBeenCalledOnce()
  })

  it('stays interactive for tools that do not select text', async () => {
    const { tool } = textTool(false)
    const svg = mount(fakePage(['Hello']), tool)
    await vi.waitFor(() => expect(svg.getAttribute('viewBox')).toBe('0 0 200 200'))
    expect(svg.classList.contains('interactive')).toBe(true)
  })
})
