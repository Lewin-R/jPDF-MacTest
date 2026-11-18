import { listen } from '@tauri-apps/api/event'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { getLaunchFiles } from '../core/ipc/api'

type OpenHandler = (path: string) => Promise<void>

let openHandler: OpenHandler | null = null

export function pdfPaths(paths: readonly string[]): string[] {
  return paths.filter((p) => p.toLowerCase().endsWith('.pdf'))
}

async function openAll(paths: readonly string[]): Promise<void> {
  const open = openHandler
  if (!open) return
  for (const p of pdfPaths(paths)) await open(p)
}

export async function pickAndOpen(): Promise<void> {
  const picked = await openDialog({
    multiple: true,
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  })
  if (!picked) return
  await openAll(Array.isArray(picked) ? picked : [picked])
}

export function initFileOpening(open: OpenHandler): () => void {
  openHandler = open
  let disposed = false
  const unlisteners: Array<() => void> = []
  const track = (p: Promise<() => void>) =>
    p.then((un) => (disposed ? un() : unlisteners.push(un)))

  track(
    getCurrentWebview().onDragDropEvent((e) => {
      if (e.payload.type === 'drop') void openAll(e.payload.paths)
    }),
  )
  track(listen<string[]>('open-files', (e) => void openAll(e.payload)))
  void getLaunchFiles().then((files) => openAll(files))

  return () => {
    disposed = true
    unlisteners.forEach((un) => un())
    if (openHandler === open) openHandler = null
  }
}
