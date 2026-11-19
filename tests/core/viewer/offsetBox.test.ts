// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getDocument, type PDFDocumentLoadingTask } from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { PageViewport } from 'pdfjs-dist'
import { screenBox } from '../../../src/annotations/freetext/screen'
import { frameOrigin, frameSize, pageBoxRect } from '../../../src/core/geometry/textLayout'
import { clientToPdf } from '../../../src/core/viewer/viewerMath'

const MEDIA_BOX = [50, 100, 645, 942] as const

/** Two pages with /MediaBox [50 100 645 942]; the second also has /Rotate 90. */
function offsetBoxPdf(): Uint8Array {
  const box = `/MediaBox [${MEDIA_BOX.join(' ')}]`
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
    `<< /Type /Page /Parent 2 0 R ${box} >>`,
    `<< /Type /Page /Parent 2 0 R ${box} /Rotate 90 >>`,
  ]
  let pdf = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((body, i) => {
    offsets.push(pdf.length)
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`
  })
  const xref = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const o of offsets) pdf += `${String(o).padStart(10, '0')} 00000 n \n`
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return new TextEncoder().encode(pdf)
}

let task: PDFDocumentLoadingTask
const viewports: Record<0 | 90, PageViewport> = {} as Record<0 | 90, PageViewport>

beforeAll(async () => {
  task = getDocument({ data: offsetBoxPdf(), isEvalSupported: false })
  const doc = await task.promise
  viewports[0] = (await doc.getPage(1)).getViewport({ scale: 1.5 })
  viewports[90] = (await doc.getPage(2)).getViewport({ scale: 1.5 })
})

afterAll(() => task.destroy())

const close = (a: readonly number[], b: readonly number[]) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 6))

describe.each([0, 90] as const)('offset /MediaBox with /Rotate %i (real pdf.js viewport)', (rotation) => {
  const vp = () => viewports[rotation]
  /** The page element on screen: shifted and CSS-scaled 2x relative to viewport units. */
  const box = () => ({ left: 30, top: 40, width: vp().width * 2, height: vp().height * 2 })

  it('uses the page rotation and the offset view box', () => {
    expect(vp().rotation).toBe(rotation)
    expect(vp().viewBox).toEqual([...MEDIA_BOX])
  })

  it('clientToPdf inverts convertToViewportPoint', () => {
    const b = box()
    for (const [cx, cy] of [[30, 40], [130, 540], [b.left + b.width, b.top + b.height]]) {
      const p = clientToPdf(cx, cy, b, vp())
      const [vx, vy] = vp().convertToViewportPoint(p[0], p[1])
      close([vx, vy], [(cx - b.left) / 2, (cy - b.top) / 2])
    }
  })

  it('maps the page corners onto the /MediaBox corners', () => {
    const b = box()
    const [x0, y0, x1, y1] = MEDIA_BOX
    // Screen top-left / bottom-right: rotation 0 is (x0, y1) / (x1, y0); rotation 90
    // (screen right = +y, down = +x) is (x0, y0) / (x1, y1).
    const [tl, br] = rotation === 0 ? [[x0, y1], [x1, y0]] : [[x0, y0], [x1, y1]]
    close(clientToPdf(b.left, b.top, b, vp()), tl)
    close(clientToPdf(b.left + b.width, b.top + b.height, b, vp()), br)
  })

  it('pageBoxRect at a clicked point is drawn there, upright, and frameOrigin recovers the point', () => {
    const b = box()
    const [cx, cy] = [b.left + 200, b.top + 300]
    const origin = clientToPdf(cx, cy, b, vp())
    const rect = pageBoxRect(origin, 200, 30, rotation)
    const s = screenBox(rect, vp())
    close([s.left, s.top, s.width, s.height], [(cx - b.left) / 2, (cy - b.top) / 2, 200 * 1.5, 30 * 1.5])
    close(frameOrigin(rect, rotation), origin)
    const size = frameSize(rect, rotation)
    close([size.width, size.height], [200, 30])
    const [x0, y0, x1, y1] = MEDIA_BOX
    expect(rect[0] >= x0 && rect[1] >= y0 && rect[2] <= x1 && rect[3] <= y1).toBe(true)
  })
})
