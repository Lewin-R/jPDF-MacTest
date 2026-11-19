import { describe, expect, it } from 'vitest'
import { insertImage } from '../../src/app/insertImage'
import { History } from '../../src/core/session/history.svelte'
import type { ImageAnnotation } from '../../src/core/session/model'
import { AnnotationStore } from '../../src/core/session/store.svelte'
import { blankViewport } from '../../src/core/viewer/pageSource'

function session() {
  const store = new AnnotationStore()
  const history = new History(store)
  let committed = 0
  return { store, history, commitPendingEdit: () => void committed++, committed: () => committed }
}

const clip = { width: 200, height: 100, rgba: new Uint8Array(200 * 100 * 4) }
const encoder = async () => new Uint8Array([1, 2, 3])

describe('insertImage', () => {
  it('adds one image annotation on the page at the click point, as one undo step', async () => {
    const s = session()
    const a = await insertImage(s, 2, [100, 700], blankViewport(600, 800, 1.5, 0), clip, 'Julie', encoder)
    expect(s.store.all()).toEqual([a])
    expect(a).toMatchObject({
      kind: 'image', page: 2, sourceRef: null, author: 'Julie',
      rect: [100, 625, 250, 700], image: { width: 200, height: 100, png: 'AQID' },
    })
    expect(Date.parse(a.modifiedAt)).not.toBeNaN()
    expect(s.committed()).toBe(1)
    s.history.undo()
    expect(s.store.all()).toEqual([])
    expect(s.history.canUndo).toBe(false)
  })

  it('places a downscaled image at the size of the clipboard image', async () => {
    const s = session()
    const big = { width: 4000, height: 2000, rgba: new Uint8Array(4) }
    const a: ImageAnnotation = await insertImage(s, 0, [0, 800], blankViewport(600, 800, 1, 0), big, 'J', encoder)
    // 80 % of 600 wide: 480 x 240 pt, from the clipboard size (not the 2000 px stored).
    expect(a.image).toMatchObject({ width: 2000, height: 1000 })
    expect(a.rect[2] - a.rect[0]).toBeCloseTo(480)
    expect(a.rect[3] - a.rect[1]).toBeCloseTo(240)
  })
})
