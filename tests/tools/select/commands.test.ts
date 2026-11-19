import { describe, expect, it, vi } from 'vitest'
import { CommandRegistry } from '../../../src/core/registry/commands'
import { KeybindingRegistry } from '../../../src/core/registry/keybindings'
import type { TextEdit } from '../../../src/core/registry/tools'
import { History } from '../../../src/core/session/history.svelte'
import type { FreeTextAnnotation, HighlightAnnotation } from '../../../src/core/session/model'
import type { DocumentSession } from '../../../src/core/session/session.svelte'
import { AnnotationStore } from '../../../src/core/session/store.svelte'
import { toasts } from '../../../src/ui/toasts.svelte'
import { editSelected, registerSelectionCommands } from '../../../src/tools/select/commands'
import { boxHeight, layoutLines } from '../../../src/core/geometry/textLayout'

const key = (init: KeyboardEventInit) => new KeyboardEvent('keydown', init)

const hl: HighlightAnnotation = {
  id: 'h', page: 0, sourceRef: null, modifiedAt: '', author: '', kind: 'highlight',
  quads: [[0, 10, 10, 10, 0, 0, 10, 0]], color: [1, 1, 0], opacity: 0.4,
}

function setup() {
  const store = new AnnotationStore()
  store.load([hl])
  const history = new History(store)
  const session = { store, history } as unknown as DocumentSession
  const state = { selection: [] as string[], textEdit: null as TextEdit | null }
  const cmds = new CommandRegistry()
  const keys = new KeybindingRegistry(cmds)
  let active = true
  const dispose = registerSelectionCommands(() => (active ? { session, state } : null), cmds, keys)
  return { store, history, state, cmds, keys, dispose, deactivate: () => (active = false) }
}

describe('selection commands', () => {
  it('edit.delete deletes the selection (Delete, Backspace) as one undo step', async () => {
    const t = setup()
    expect(t.cmds.canExecute('edit.delete')).toBe(false)
    expect(t.keys.handle(key({ key: 'Delete' }))).toBe(false)
    t.state.selection = ['h']
    expect(t.keys.handle(key({ key: 'Delete' }))).toBe(true)
    await Promise.resolve()
    expect(t.store.all()).toEqual([])
    expect(t.state.selection).toEqual([])
    t.history.undo()
    expect(t.store.get('h')).toBeDefined()
    t.state.selection = ['h']
    expect(t.keys.handle(key({ key: 'Backspace' }))).toBe(true)
    await Promise.resolve()
    expect(t.store.all()).toEqual([])
  })

  it('edit.delete is disabled while a text box is edited or the selection is gone', () => {
    const t = setup()
    t.state.selection = ['h']
    t.state.textEdit = {} as TextEdit
    expect(t.cmds.canExecute('edit.delete')).toBe(false)
    t.state.textEdit = null
    t.state.selection = ['missing']
    expect(t.cmds.canExecute('edit.delete')).toBe(false)
    t.deactivate()
    expect(t.cmds.canExecute('edit.delete')).toBe(false)
  })

  it('edit.deselect clears the selection on Escape, and lets Escape through without one', async () => {
    const t = setup()
    expect(t.keys.handle(key({ key: 'Escape' }))).toBe(false)
    t.state.selection = ['h']
    expect(t.keys.handle(key({ key: 'Escape' }))).toBe(true)
    await Promise.resolve()
    expect(t.state.selection).toEqual([])
    expect(t.store.get('h')).toBeDefined()
  })

  it('dispose unregisters the commands', () => {
    const t = setup()
    t.dispose()
    expect(t.cmds.has('edit.delete')).toBe(false)
    expect(t.cmds.has('edit.deselect')).toBe(false)
  })
})

describe('editSelected', () => {
  function session(...list: (HighlightAnnotation | FreeTextAnnotation)[]) {
    const store = new AnnotationStore()
    store.load(list)
    const history = new History(store)
    const doc = { getPage: async () => ({ rotate: 0 }) }
    return { store, history, doc } as unknown as DocumentSession
  }

  it('commits one update, skipping no-op edits', async () => {
    const s = session(hl)
    await editSelected(s, { ...hl, color: [1, 0, 0] })
    expect((s.store.get('h') as HighlightAnnotation).color).toEqual([1, 0, 0])
    expect(s.store.get('h')!.modifiedAt).not.toBe('')
    await editSelected(s, { ...(s.store.get('h') as HighlightAnnotation), modifiedAt: 'x' })
    s.history.undo()
    expect(s.store.get('h')).toEqual(hl)
    expect(s.history.canUndo).toBe(false)
  })

  it('re-lays out a text box whose font size changed', async () => {
    const text = 'the quick brown fox jumps over'
    const box: FreeTextAnnotation = {
      id: 'b', page: 0, sourceRef: null, modifiedAt: '', author: '', kind: 'freetext',
      rect: [10, 70, 110, 90], text, lines: layoutLines(text, 10, 100), fontSize: 10,
      textColor: [0, 0, 0], background: null,
    }
    const s = session(box)
    await editSelected(s, { ...box, fontSize: 20 })
    const a = s.store.get('b') as FreeTextAnnotation
    const lines = layoutLines(text, 20, 100)
    expect(a.lines).toEqual(lines)
    expect(a.rect).toEqual([10, 90 - boxHeight(lines.length, 20), 110, 90])
  })

  it('applies only the edited fields to the annotation as it is after the await', async () => {
    const text = 'the quick brown fox jumps over'
    const box: FreeTextAnnotation = {
      id: 'b', page: 0, sourceRef: null, modifiedAt: '', author: '', kind: 'freetext',
      rect: [10, 70, 110, 90], text, lines: layoutLines(text, 10, 100), fontSize: 10,
      textColor: [0, 0, 0], background: null,
    }
    const s = session(box)
    let release!: () => void
    s.doc.getPage = (() => new Promise((r) => (release = () => r({ rotate: 0 })))) as never
    const pending = editSelected(s, { ...box, fontSize: 20 })
    // Meanwhile the text colour changes (e.g. an undo/redo or another edit).
    s.store.update('b', { ...box, textColor: [1, 0, 0] })
    release()
    await pending
    const a = s.store.get('b') as FreeTextAnnotation
    expect(a.fontSize).toBe(20)
    expect(a.textColor).toEqual([1, 0, 0])
  })

  it('does nothing when the annotation vanished meanwhile', async () => {
    const s = session(hl)
    s.store.remove('h')
    await editSelected(s, { ...hl, color: [1, 0, 0] })
    expect(s.store.get('h')).toBeUndefined()
  })

  it('reports a failure with a toast instead of throwing', async () => {
    const text = 'abc'
    const box: FreeTextAnnotation = {
      id: 'b', page: 0, sourceRef: null, modifiedAt: '', author: '', kind: 'freetext',
      rect: [10, 70, 110, 90], text, lines: layoutLines(text, 10, 100), fontSize: 10,
      textColor: [0, 0, 0], background: null,
    }
    const s = session(box)
    s.doc.getPage = (async () => { throw new Error('boom') }) as never
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const show = vi.spyOn(toasts, 'show')
    await expect(editSelected(s, { ...box, fontSize: 20 })).resolves.toBeUndefined()
    expect(err).toHaveBeenCalled()
    expect(show).toHaveBeenCalledWith('Could not apply the change', 'error')
    err.mockRestore()
    show.mockRestore()
  })
})
