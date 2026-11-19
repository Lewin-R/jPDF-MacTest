// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { blankViewport, renderKey, sourceViewport } from '../../../src/core/viewer/pageSource'
import type { PageEntry } from '../../../src/core/session/pages'

type Viewport = {
  width: number
  height: number
  rotation: number
  transform: number[]
  convertToViewportPoint(x: number, y: number): number[]
  convertToPdfPoint(x: number, y: number): number[]
}

/** pdf.js' own PageViewport class (not exported), taken from a real page's viewport. */
async function realViewportClass() {
  const task = getDocument({ data: new Uint8Array(readFileSync('tests/fixtures/sample-annotated.pdf')), isEvalSupported: false })
  const doc = await task.promise
  const page = await doc.getPage(1)
  const ctor = page.getViewport({ scale: 1 }).constructor as new (p: object) => Viewport
  return { ctor, page, close: () => task.destroy() }
}

describe('blankViewport', () => {
  it('matches pdf.js PageViewport for every rotation', async () => {
    const { ctor, close } = await realViewportClass()
    for (const rotation of [0, 90, 180, 270]) {
      const real = new ctor({ viewBox: [0, 0, 300, 500], userUnit: 1, scale: 1.5, rotation })
      const ours = blankViewport(300, 500, 1.5, rotation) as unknown as Viewport
      expect([ours.width, ours.height, ours.rotation]).toEqual([real.width, real.height, real.rotation])
      ours.transform.forEach((v, k) => expect(v).toBeCloseTo(real.transform[k], 9))
      for (const [x, y] of [[0, 0], [300, 0], [12.5, 480]]) {
        const p = ours.convertToViewportPoint(x, y)
        const q = real.convertToViewportPoint(x, y)
        expect(p[0]).toBeCloseTo(q[0], 9)
        expect(p[1]).toBeCloseTo(q[1], 9)
        const back = ours.convertToPdfPoint(p[0], p[1])
        expect(back[0]).toBeCloseTo(x, 9)
        expect(back[1]).toBeCloseTo(y, 9)
      }
    }
    await close()
  })
})

describe('sourceViewport', () => {
  it('adds the extra rotation to the page /Rotate', async () => {
    const { page, close } = await realViewportClass()
    const plain = page.getViewport({ scale: 2 })
    const turned = sourceViewport(page as never, { kind: 'source', source: 0, rotate: 90 }, 2)
    expect(turned.rotation).toBe((page.rotate + 90) % 360)
    expect([turned.width, turned.height]).toEqual([plain.height, plain.width])
    expect(sourceViewport(page as never, { kind: 'source', source: 0, rotate: 0 }, 2).rotation).toBe(plain.rotation)
    await close()
  })
})

describe('renderKey', () => {
  const src = (source: number, rotate = 0): PageEntry => ({ kind: 'source', source, rotate })

  it('differs per rotation, source, annotation drawing and position', () => {
    const keys = [
      renderKey('s', 1, 1.5, src(0), true),
      renderKey('s', 1, 1.5, src(0, 90), true),
      renderKey('s', 1, 1.5, src(1), true),
      renderKey('s', 1, 1.5, src(0), false),
      renderKey('s', 2, 1.5, src(0), true),
      renderKey('s', 1, 1.5, { kind: 'blank', width: 10, height: 20, rotate: 0 }, true),
    ]
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('keeps the page part before the @ (one entry per list position)', () => {
    const k = renderKey('sess', 3, 1.5, src(0, 90), true)
    expect(k.slice(0, k.lastIndexOf('@'))).toBe('sess:3')
  })
})
