import { commands, type CommandRegistry } from './commands'

export function chordFromEvent(e: KeyboardEvent): string {
  let key = e.key
  if (key === ' ') key = 'Space'
  else if (key === '+') key = 'Plus'
  else if (key.length === 1) key = key.toUpperCase()

  const parts: string[] = []
  if (e.ctrlKey) parts.push('Ctrl')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  parts.push(key)
  return parts.join('+')
}

function isEditableTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false
  const tag = t.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable
}

export class KeybindingRegistry {
  private bindings = new Map<string, string>()

  constructor(private cmds: CommandRegistry) {}

  bind(chord: string, commandId: string): () => void {
    this.bindings.set(chord, commandId)
    return () => {
      if (this.bindings.get(chord) === commandId) this.bindings.delete(chord)
    }
  }

  handle(e: KeyboardEvent): boolean {
    // Bare keys (no Ctrl/Alt) are typing in an editable field; F-keys and Escape still pass.
    if (!e.ctrlKey && !e.altKey && isEditableTarget(e.target) && e.key !== 'Escape' && !/^F\d+$/.test(e.key)) {
      return false
    }
    const id = this.bindings.get(chordFromEvent(e))
    if (id === undefined || !this.cmds.canExecute(id)) return false
    // Fire and forget: the caller needs a synchronous answer for preventDefault.
    void this.cmds.execute(id)
    return true
  }
}

export const keybindings = new KeybindingRegistry(commands)
