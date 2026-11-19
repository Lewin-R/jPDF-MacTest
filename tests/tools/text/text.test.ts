import { describe, expect, it } from 'vitest'
import '../../../src/annotations'
import { createTextHandler, textTool, type TextSettings } from '../../../src/tools/text'
import type { PagePointerEvent, TextEdit, ToolContext } from '../../../src/core/registry/tools'
import { History } from '../../../src/core/session/history.svelte'
import type { FreeTextAnnotation, Point } from '../../../src/core/session/model'
import { AnnotationStore } from '../../../src/core/session/store.svelte'
import { settings as appSettings } from '../../../src/core/settings/settings.svelte'
import { pageBoxRect } from '../../../src/core/geometry/textLayout'

function ev(pdf: Point, rotation = 0): PagePointerEvent {
  return {
    page: 1,
    pdf,
    screen: [0, 0],
    vp: { scale: 2, rotation } as never,
    native: {} as PointerEvent,
    toPdf: () => pdf,
  }
}

const SETTINGS: TextSettings = { textColor: [0, 0, 1], fontSize: 10, background: { color: [1, 1, 0], opacity: 0.5 } }

function box(over: Partial<FreeTextAnnotation> = {}): FreeTextAnnotation {
  return {
    id: 'box', page: 1, sourceRef: '7R', modifiedAt: '2026-01-01T00:00:00Z', author: 'Someone', kind: 'freetext',
    rect: [100, 468, 300, 500], text: 'old', lines: ['old'], fontSize: 10, textColor: [1, 0, 0], background: null,
    ...over,
  }
}

function setup(loaded: FreeTextAnnotation[] = []) {
  const store = new AnnotationStore()
  store.load(loaded)
  const history = new History(store)
  const session = {
    store,
    history,
    pendingEdit: null as (() => void) | null,
    commitPendingEdit() {
      const c = session.pendingEdit
      session.pendingEdit = null
      c?.()
    },
  }
  let edit: TextEdit | null = null
  let hidden: string[] = []
  const ctx = {
    session,
    execute: (c: Parameters<History['execute']>[0]) => history.execute(c),
    textEdit: { set: (e: TextEdit | null) => void (edit = e) },
    hidden: { set: (ids: Iterable<string>) => void (hidden = [...ids]) },
  } as unknown as ToolContext
  const handler = createTextHandler(ctx, () => SETTINGS)
  const click = (p: Point, rotation = 0) => {
    handler.onPointerDown!(ev(p, rotation))
    handler.onPointerUp!(ev(p, rotation))
  }
  return { store, history, session, handler, click, edit: () => edit, hidden: () => hidden }
}

const texts = (store: AnnotationStore) => store.all().map((a) => (a as FreeTextAnnotation).text)

describe('text tool', () => {
  it('default settings match the toolbar default', () => {
    expect(textTool.defaultSettings).toEqual({ textColor: [0.1, 0.1, 0.1], fontSize: 12, background: null })
    expect(textTool.shortcut).toBe('T')
    expect(textTool.allowMultipleInstances).toBe(true)
  })

  it('click creates a box at the click point in edit state', () => {
    const t = setup()
    t.click([100, 500])
    const e = t.edit()!
    expect(e).not.toBeNull()
    expect(e.rotation).toBe(0)
    // One line at 10pt: 10 * 1.2 + 2 * 4 = 20 tall, 200 wide, top-left at the click.
    expect(e.draft).toMatchObject({
      kind: 'freetext', page: 1, sourceRef: null, text: '', rect: [100, 480, 300, 500],
      fontSize: 10, textColor: [0, 0, 1], background: { color: [1, 1, 0], opacity: 0.5 },
      author: appSettings.data.author,
    })
    expect(t.store.all()).toEqual([])
    expect(t.history.canUndo).toBe(false)
    expect(t.session.pendingEdit).not.toBeNull()
  })

  it('commit adds the annotation with wrapped lines and fitted height', () => {
    const t = setup()
    t.click([100, 500])
    const e = t.edit()!
    e.setText('Hello world\nsecond')
    e.commit()
    expect(t.edit()).toBeNull()
    expect(t.session.pendingEdit).toBeNull()
    const [a] = t.store.all() as FreeTextAnnotation[]
    expect(a).toMatchObject({ text: 'Hello world\nsecond', lines: ['Hello world', 'second'], rect: [100, 468, 300, 500] })
    expect(a.id).toBe(e.draft.id)
    e.commit() // blur after Escape: no second add
    expect(t.store.all()).toHaveLength(1)
    t.history.undo()
    expect(t.store.all()).toEqual([])
  })

  it('blank text discards a new box', () => {
    const t = setup()
    t.click([100, 500])
    t.edit()!.setText('  \n ')
    t.edit()!.commit()
    expect(t.store.all()).toEqual([])
    expect(t.history.canUndo).toBe(false)
  })

  it('clicking an existing box edits it and commits updateAnnotation', () => {
    const t = setup([box()])
    t.click([150, 490])
    const e = t.edit()!
    expect(e.draft.id).toBe('box')
    expect(t.hidden()).toEqual(['box'])
    e.setText('new text')
    e.commit()
    expect(t.hidden()).toEqual([])
    expect(t.store.all()).toHaveLength(1)
    expect(t.store.get('box')).toMatchObject({
      text: 'new text', lines: ['new text'], rect: [100, 480, 300, 500], sourceRef: '7R',
      author: 'Someone', textColor: [1, 0, 0],
    })
    t.history.undo()
    expect(texts(t.store)).toEqual(['old'])
  })

  it('an unchanged edit records nothing', () => {
    const t = setup([box()])
    t.click([150, 490])
    t.edit()!.commit()
    expect(t.history.canUndo).toBe(false)
    expect(t.session.pendingEdit).toBeNull()
  })

  it('editing an existing box to blank deletes it', () => {
    const t = setup([box()])
    t.click([150, 490])
    t.edit()!.setText(' ')
    t.edit()!.commit()
    expect(t.store.all()).toEqual([])
    t.history.undo()
    expect(texts(t.store)).toEqual(['old'])
  })

  it('a click while a box is open only closes it', () => {
    const t = setup()
    t.click([100, 500])
    t.edit()!.setText('first')
    t.click([10, 10])
    expect(t.edit()).toBeNull()
    expect(texts(t.store)).toEqual(['first'])
    t.click([10, 10])
    expect(t.edit()).not.toBeNull()
  })

  it('commitPendingEdit (save) and deactivation commit the open box', () => {
    const t = setup()
    t.click([100, 500])
    t.edit()!.setText('saved')
    t.session.commitPendingEdit()
    expect(texts(t.store)).toEqual(['saved'])
    t.click([100, 300])
    t.edit()!.setText('on tool switch')
    t.handler.onDeactivate!()
    expect(texts(t.store)).toEqual(['saved', 'on tool switch'])
    expect(t.edit()).toBeNull()
  })

  it('on a rotated page the box is laid out in the screen frame', () => {
    const t = setup()
    t.click([100, 500], 90)
    const e = t.edit()!
    expect(e.rotation).toBe(90)
    expect(e.draft.rect).toEqual(pageBoxRect([100, 500], 200, 20, 90))
    e.setText('a\nb')
    e.commit()
    // Two lines: 32 tall on screen = 32 wide in PDF x; top-left corner kept.
    expect((t.store.all()[0] as FreeTextAnnotation).rect).toEqual([100, 500, 132, 700])
  })
})
