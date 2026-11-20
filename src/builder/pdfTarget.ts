import { save as saveDialog } from '@tauri-apps/plugin-dialog'
import { tabs } from '../app/tabs.svelte'
import { pathExists } from '../core/ipc/api'
import { toasts } from '../ui/toasts.svelte'

const PDF_FILTER = [{ name: 'PDF', extensions: ['pdf'] }]

/**
 * Asks where to write a new PDF (the save dialog, starting at `defaultPath`)
 * and checks the choice. Null when cancelled or refused (with a toast): a
 * name typed without `.pdf` that already exists with it (the dialog only
 * confirmed replacing the name as typed), or a file open in a tab (writing
 * it would pull the file out from under that tab).
 */
export async function pickNewPdf(defaultPath: string): Promise<string | null> {
  const picked = await saveDialog({ defaultPath, filters: PDF_FILTER })
  if (!picked) return null
  let target = picked
  if (!target.toLowerCase().endsWith('.pdf')) {
    target += '.pdf'
    if (await pathExists(target).catch(() => true)) {
      toasts.show(`${target.split(/[\\/]/).pop()} already exists. Choose it in the dialog to replace it.`, 'error')
      return null
    }
  }
  if (tabs.findByPath(target)) {
    toasts.show('This file is open in a tab — close it first', 'error')
    return null
  }
  return target
}
