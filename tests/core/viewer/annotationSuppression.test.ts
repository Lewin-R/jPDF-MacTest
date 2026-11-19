// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { AnnotationMode, getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'

// tests/fixtures/sample-annotated.pdf is produced by the Rust writer
// (`cargo test -- --ignored write_sample`): page 1 holds a foreign /Ink, a
// /Link and two JuliePDF /Ink annotations with appearance streams.
async function open() {
  const data = new Uint8Array(readFileSync('tests/fixtures/sample-annotated.pdf'))
  const task = getDocument({
    data,
    isEvalSupported: false,
    standardFontDataUrl: 'node_modules/pdfjs-dist/standard_fonts/',
  })
  const doc = await task.promise
  const page = await doc.getPage(1)
  const annots = (await page.getAnnotations()) as Array<{ id: string; subtype: string }>
  return { task, doc, page, annots }
}

/** Ids of the annotations whose appearance is in the page's display operator list. */
async function drawnIds(page: Awaited<ReturnType<typeof open>>['page']): Promise<string[]> {
  const ops = await page.getOperatorList({ annotationMode: AnnotationMode.ENABLE_STORAGE })
  const ids: string[] = []
  ops.fnArray.forEach((fn, i) => {
    if (fn === OPS.beginAnnotation) ids.push(ops.argsArray[i][0] as string)
  })
  return ids
}

describe('managed-annotation suppression (pdf.js annotationStorage noView)', () => {
  it('excludes annotations marked noView and keeps the others', async () => {
    const { task, doc, page, annots } = await open()
    // Page order: foreign /Ink, /Link, then the two inks appended by the writer.
    const inks = annots.filter((a) => a.subtype === 'Ink').map((a) => a.id)
    const [foreign, ...managed] = inks
    expect(managed).toHaveLength(2)
    const before = await drawnIds(page)
    for (const id of managed) expect(before).toContain(id)

    for (const id of managed) doc.annotationStorage.setValue(id, { noView: true })
    const after = await drawnIds(page)
    for (const id of managed) expect(after).not.toContain(id)
    expect(after).toContain(foreign)
    expect(after).toEqual(before.filter((id) => !managed.includes(id)))
    await task.destroy()
  })

  it('renders a managed ink as an isolated knockout group under its opacity and blend mode', async () => {
    const { task, page, annots } = await open()
    const [, managed] = annots.filter((a) => a.subtype === 'Ink').map((a) => a.id)
    const ops = await page.getOperatorList({ annotationMode: AnnotationMode.ENABLE_STORAGE })
    const start = ops.fnArray.findIndex((fn, i) => fn === OPS.beginAnnotation && ops.argsArray[i][0] === managed)
    const end = ops.fnArray.indexOf(OPS.endAnnotation, start)
    const fns = ops.fnArray.slice(start, end)
    const args = ops.argsArray.slice(start, end)
    // GS0 (opacity 0.5, multiply) is set before the group is painted.
    const gs = fns.indexOf(OPS.setGState)
    const group = fns.indexOf(OPS.beginGroup)
    expect(gs).toBeGreaterThan(0)
    expect(group).toBeGreaterThan(gs)
    const state = Object.fromEntries(args[gs][0] as [string, unknown][])
    expect(state).toMatchObject({ CA: 0.5, ca: 0.5, BM: 'multiply' })
    expect(args[group][0]).toMatchObject({ isolated: true, knockout: true })
    // The strokes inside the group are drawn opaque, so they never darken each other.
    expect(fns.slice(group).filter((fn) => fn === OPS.setGState)).toHaveLength(0)
    expect(fns.indexOf(OPS.endGroup)).toBeGreaterThan(group)
    await task.destroy()
  })
})
