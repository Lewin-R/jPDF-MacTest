import { describe, expect, it } from 'vitest'
import { CommandRegistry } from '../../../src/core/registry/commands'
import { KeybindingRegistry } from '../../../src/core/registry/keybindings'
import { addAnnotations } from '../../../src/core/session/commands'
import { registerEditCommands } from '../../../src/core/session/editCommands'
import { History } from '../../../src/core/session/history.svelte'
import { AnnotationStore } from '../../../src/core/session/store.svelte'
import type { DocumentSession } from '../../../src/core/session/session.svelte'

function key(init: KeyboardEventInit): KeyboardEvent {
  return new KeyboardEvent('keydown', init)
}

describe('registerEditCommands', () => {
  it('undo/redo via chords on the active session, disabled when impossible', async () => {
    const store = new AnnotationStore()
    const history = new History(store)
    const session = { store, history } as unknown as DocumentSession
    const cmds = new CommandRegistry()
    const keys = new KeybindingRegistry(cmds)
    let active: DocumentSession | null = session
    const dispose = registerEditCommands(() => active, cmds, keys)

    expect(cmds.canExecute('edit.undo')).toBe(false)
    history.execute(addAnnotations([{
      id: 'a', page: 0, sourceRef: null, modifiedAt: '', author: '', kind: 'highlight',
      quads: [[0, 0, 0, 0, 0, 0, 0, 0]], color: [1, 1, 0], opacity: 0.4,
    }]))
    expect(keys.handle(key({ key: 'z', ctrlKey: true }))).toBe(true)
    await Promise.resolve()
    expect(store.all()).toEqual([])
    expect(cmds.canExecute('edit.redo')).toBe(true)
    expect(keys.handle(key({ key: 'Z', ctrlKey: true, shiftKey: true }))).toBe(true)
    await Promise.resolve()
    expect(store.all()).toHaveLength(1)
    keys.handle(key({ key: 'z', ctrlKey: true }))
    await Promise.resolve()
    expect(keys.handle(key({ key: 'y', ctrlKey: true }))).toBe(true)

    active = null
    expect(cmds.canExecute('edit.undo')).toBe(false)
    dispose()
    expect(cmds.has('edit.undo')).toBe(false)
  })
})
