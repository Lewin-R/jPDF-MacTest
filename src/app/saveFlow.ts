import { save as saveDialog } from '@tauri-apps/plugin-dialog'
import { isAppError, savePdf } from '../core/ipc/api'
import { commands } from '../core/registry/commands'
import { keybindings } from '../core/registry/keybindings'
import type { Annotation } from '../core/session/model'
import type { DocumentSession } from '../core/session/session.svelte'
import { toasts } from '../ui/toasts.svelte'
import { askToSave } from './ConfirmClose.svelte'

const DEFAULT_AUTHOR = 'JuliePDF'
const PDF_FILTER = [{ name: 'PDF', extensions: ['pdf'] }]

/** Saves of one session run one after another. */
const inFlight = new WeakMap<DocumentSession, Promise<unknown>>()
/**
 * sourceRefs of annotations deleted while a save was in flight: the store's
 * tracking is reset by that save, so the next save sends these explicitly.
 */
const pendingDeletes = new WeakMap<DocumentSession, Set<string>>()

function withAuthor(a: Annotation): Annotation {
  return a.author ? a : { ...a, author: DEFAULT_AUTHOR }
}

function samePath(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase()
}

function showSaveError(s: DocumentSession, e: unknown): void {
  if (isAppError(e) && (e.code === 'Locked' || e.code === 'ReadOnly')) {
    const why = e.code === 'Locked' ? 'is locked by another program' : 'is read-only'
    toasts.show(`Could not save: ${s.fileName} ${why}`, 'error', {
      label: 'Save As…',
      run: () => void saveSessionAs(s),
    })
    return
  }
  const detail = isAppError(e) ? e.message : e instanceof Error ? e.message : String(e)
  toasts.show(`Could not save ${s.fileName}: ${detail}`, 'error')
}

async function writeSession(s: DocumentSession, target: string): Promise<boolean> {
  const { store, history } = s
  const present = new Set(store.all().map((a) => a.sourceRef).filter((r) => r !== null))
  const deletes = [
    ...new Set([...store.deletedSourceRefs(), ...(pendingDeletes.get(s) ?? [])]),
  ].filter((r) => !present.has(r))
  const upserts = store.changedSince().map(withAuthor)
  const before = new Map(store.all().map((a) => [a.id, a]))

  let refs: Record<string, string>
  try {
    ;({ refs } = await savePdf(s.path, target, upserts, deletes))
  } catch (e) {
    console.error(`Failed to save ${s.path} to ${target}`, e)
    showSaveError(s, e)
    return false
  }

  // Edits made while the file was being written are not in it: keep them pending.
  const changedDuring = store.all().filter((a) => before.get(a.id) !== a).map((a) => a.id)
  const deletedDuring = new Set<string>()
  for (const [id, a] of before) {
    const ref = a.sourceRef ?? refs[id]
    if (!store.get(id) && ref) deletedDuring.add(ref)
  }

  store.markSaved(refs)
  // The pdf.js document still holds the old bytes; new refs are not in them,
  // but keep every ref this document has known suppressed.
  s.suppress(Object.values(refs))
  if (!samePath(target, s.path)) s.setPath(target)
  if (changedDuring.length === 0 && deletedDuring.size === 0) {
    pendingDeletes.delete(s)
    history.markClean()
  } else {
    for (const id of changedDuring) store.update(id, store.get(id)!)
    pendingDeletes.set(s, deletedDuring)
  }
  return true
}

/**
 * Writes the session's annotation changes as an incremental update of its
 * current file to `targetPath` (default: the current file). On success the
 * session is clean and points at `targetPath`; returns false on error (an
 * error toast is shown and the session stays dirty).
 */
export function saveSession(s: DocumentSession, targetPath?: string): Promise<boolean> {
  const prev = inFlight.get(s)
  const write = () => writeSession(s, targetPath ?? s.path)
  // Start right away when idle so the written state is the state at the call.
  const run = prev ? prev.then(write) : write()
  inFlight.set(s, run)
  run
    .finally(() => {
      if (inFlight.get(s) === run) inFlight.delete(s)
    })
    .catch(() => {})
  return run
}

/** Asks for a target file and saves there; false if cancelled or failed. */
export async function saveSessionAs(s: DocumentSession): Promise<boolean> {
  let target = await saveDialog({ defaultPath: s.path, filters: PDF_FILTER })
  if (!target) return false
  if (!target.toLowerCase().endsWith('.pdf')) target += '.pdf'
  return saveSession(s, target)
}

/**
 * Asks Save / Don't save / Cancel for a dirty session. True if the session may
 * close (not dirty, saved, or discarded), false on Cancel or a failed save.
 */
export async function confirmAndClose(s: DocumentSession): Promise<boolean> {
  if (!s.dirty) return true
  const choice = await askToSave(s.fileName)
  if (choice === 'cancel') return false
  if (choice === 'discard') return true
  return saveSession(s)
}

/** confirmAndClose for each session in turn; stops at the first one that may not close. */
export async function confirmCloseAll(sessions: readonly DocumentSession[]): Promise<boolean> {
  for (const s of sessions) if (!(await confirmAndClose(s))) return false
  return true
}

/** Registers `file.save` (Ctrl+S) and `file.saveAs` (Ctrl+Shift+S). */
export function registerSaveCommands(active: () => DocumentSession | null): () => void {
  const enabled = () => active() !== null
  const disposers = [
    commands.register({
      id: 'file.save',
      title: 'Save',
      enabled,
      run: async () => {
        const s = active()
        if (s?.dirty) await saveSession(s)
      },
    }),
    keybindings.bind('Ctrl+S', 'file.save'),
    commands.register({
      id: 'file.saveAs',
      title: 'Save As…',
      enabled,
      run: async () => {
        const s = active()
        if (s) await saveSessionAs(s)
      },
    }),
    keybindings.bind('Ctrl+Shift+S', 'file.saveAs'),
  ]
  return () => disposers.forEach((d) => d())
}
