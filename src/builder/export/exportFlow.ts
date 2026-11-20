/**
 * The builder's Export menu: copies of the open document written to a new
 * file. The session and its file are never changed.
 */
import { exportWithoutAnnotations, isAppError } from '../../core/ipc/api'
import type { DocumentSession } from '../../core/session/session.svelte'
import { toasts } from '../../ui/toasts.svelte'
import { pickNewPdf } from '../pdfTarget'

/** The suggested target: `<name> (no annotations).pdf` next to the document. */
export function cleanCopyName(path: string): string {
  return `${path.replace(/\.pdf$/i, '')} (no annotations).pdf`
}

/**
 * Asks for a target and writes the document as it is now (unsaved page
 * changes and pending flattened annotations included, as a save would write
 * them) without annotations. Links and form fields stay. On success a toast
 * offers to `open` the copy. Resolves whether a copy was written.
 */
export async function exportCleanCopy(s: DocumentSession, open: (path: string) => void): Promise<boolean> {
  if (s.broken) {
    toasts.show(`${s.fileName} cannot be exported: it no longer matches the file. Close and reopen it.`, 'error')
    return false
  }
  const target = await pickNewPdf(cleanCopyName(s.path))
  if (!target) return false
  // Flattened annotations leave the session on save, so every one here is pending.
  const flattened = s.store.all().filter((a) => a.flattened)
  try {
    const plan = await s.pagePlan()
    await exportWithoutAnnotations(s.path, target, flattened, plan ?? undefined)
  } catch (e) {
    console.error(`Exporting ${s.path} to ${target} failed`, e)
    toasts.show(isAppError(e) ? `Could not export: ${e.message}` : `Could not export ${s.fileName}`, 'error')
    return false
  }
  const name = target.split(/[\\/]/).pop()
  toasts.show(`Exported ${name} without annotations`, 'info', { label: 'Open', run: () => open(target) })
  return true
}
