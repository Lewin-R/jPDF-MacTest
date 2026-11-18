import { commands as defaultCommands, type CommandRegistry } from '../registry/commands'
import { keybindings as defaultKeybindings, type KeybindingRegistry } from '../registry/keybindings'
import type { DocumentSession } from './session.svelte'

/** Registers edit.undo / edit.redo for the active session. */
export function registerEditCommands(
  active: () => DocumentSession | null,
  commands: CommandRegistry = defaultCommands,
  keybindings: KeybindingRegistry = defaultKeybindings,
): () => void {
  const defs = [
    {
      id: 'edit.undo',
      title: 'Undo',
      chords: ['Ctrl+Z'],
      can: (s: DocumentSession) => s.history.canUndo,
      run: (s: DocumentSession) => s.history.undo(),
    },
    {
      id: 'edit.redo',
      title: 'Redo',
      chords: ['Ctrl+Y', 'Ctrl+Shift+Z'],
      can: (s: DocumentSession) => s.history.canRedo,
      run: (s: DocumentSession) => s.history.redo(),
    },
  ]
  const disposers = defs.flatMap((d) => [
    commands.register({
      id: d.id,
      title: d.title,
      run: () => {
        const s = active()
        if (s) d.run(s)
      },
      enabled: () => {
        const s = active()
        return s !== null && d.can(s)
      },
    }),
    ...d.chords.map((c) => keybindings.bind(c, d.id)),
  ])
  return () => disposers.forEach((d) => d())
}
