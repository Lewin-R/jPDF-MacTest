import { commands as defaultCommands, type CommandRegistry } from '../../core/registry/commands'
import { keybindings as defaultKeybindings, type KeybindingRegistry } from '../../core/registry/keybindings'
import { deleteAnnotations, updateAnnotation } from '../../core/session/commands'
import type { Annotation } from '../../core/session/model'
import type { DocumentSession } from '../../core/session/session.svelte'
import type { SessionToolState } from '../../core/viewer/toolRouting.svelte'
import { toasts } from '../../ui/toasts.svelte'
import { layoutFreeText } from '../text/editing'

export interface SelectionTarget {
  session: DocumentSession
  state: Pick<SessionToolState, 'selection' | 'textEdit'>
}

function selectedAnnotations({ session, state }: SelectionTarget): Annotation[] {
  return state.selection.flatMap((id) => {
    const a = session.store.get(id)
    return a ? [a] : []
  })
}

/**
 * Registers edit.delete (Delete, Backspace: deletes the selection, unless a
 * text box is being edited) and edit.deselect (Escape) for the active session.
 * Both are disabled without a selection, so the keys pass through then.
 */
export function registerSelectionCommands(
  active: () => SelectionTarget | null,
  commands: CommandRegistry = defaultCommands,
  keybindings: KeybindingRegistry = defaultKeybindings,
): () => void {
  const disposers = [
    commands.register({
      id: 'edit.delete',
      title: 'Delete selection',
      enabled: () => {
        const t = active()
        return t !== null && t.state.textEdit === null && selectedAnnotations(t).length > 0
      },
      run: () => {
        const t = active()
        if (!t) return
        const list = selectedAnnotations(t)
        t.state.selection = []
        if (list.length > 0) t.session.history.execute(deleteAnnotations(list))
      },
    }),
    keybindings.bind('Delete', 'edit.delete'),
    keybindings.bind('Backspace', 'edit.delete'),
    commands.register({
      id: 'edit.deselect',
      title: 'Deselect',
      enabled: () => (active()?.state.selection.length ?? 0) > 0,
      run: () => {
        const t = active()
        if (t) t.state.selection = []
      },
    }),
    keybindings.bind('Escape', 'edit.deselect'),
  ]
  return () => disposers.forEach((d) => d())
}

const withoutTime = (a: Annotation) => JSON.stringify({ ...a, modifiedAt: '' })

/**
 * Commits an edit of a selected annotation (selection options) as one undo
 * step; no step when nothing changed. `after` is the annotation with the user's
 * changes: those fields (relative to the annotation as it is now) are applied
 * to the annotation as it is when the edit commits, so a change made meanwhile
 * is not overwritten. A text box whose font size changed is laid out again
 * (lines re-wrapped, height fitted), which needs its page's rotation. Failures
 * are reported to the user, never thrown.
 */
export async function editSelected(session: DocumentSession, after: Annotation): Promise<void> {
  try {
    const before = session.store.get(after.id)
    if (!before) return
    const patch = Object.fromEntries(
      Object.entries(after).filter(
        ([k, v]) => JSON.stringify(v) !== JSON.stringify((before as unknown as Record<string, unknown>)[k]),
      ),
    )
    const relayout = before.kind === 'freetext' && 'fontSize' in patch
    const rotate = relayout ? (await session.doc.getPage(before.page + 1)).rotate : 0
    // The current version: the annotation may have changed (or gone) while waiting.
    const current = session.store.get(after.id)
    if (!current) return
    let next = { ...current, ...patch } as Annotation
    if (relayout && current.kind === 'freetext' && next.kind === 'freetext') {
      next = layoutFreeText(next, next.text, rotate)
    }
    if (withoutTime(current) === withoutTime(next)) return
    session.history.execute(updateAnnotation(current, { ...next, modifiedAt: new Date().toISOString() }))
  } catch (e) {
    console.error('Could not edit the selected annotation', e)
    toasts.show('Could not apply the change', 'error')
  }
}
