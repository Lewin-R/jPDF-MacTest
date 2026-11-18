import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  dragCb: null as null | ((e: { payload: unknown }) => void),
  eventCb: null as null | ((e: { payload: string[] }) => void),
  launch: [] as string[],
  picked: null as string | string[] | null,
}))

vi.mock('@tauri-apps/api/webview', () => ({
  getCurrentWebview: () => ({
    onDragDropEvent: async (cb: (e: { payload: unknown }) => void) => {
      h.dragCb = cb
      return () => {}
    },
  }),
}))
vi.mock('@tauri-apps/api/event', () => ({
  listen: async (_n: string, cb: (e: { payload: string[] }) => void) => {
    h.eventCb = cb
    return () => {}
  },
}))
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: async () => h.picked }))
vi.mock('../../src/core/ipc/api', () => ({ getLaunchFiles: async () => h.launch }))

import { initFileOpening, pdfPaths, pickAndOpen } from '../../src/app/fileOpening'

const flush = () => new Promise((r) => setTimeout(r, 0))

describe('fileOpening', () => {
  beforeEach(() => {
    h.dragCb = h.eventCb = null
    h.launch = []
    h.picked = null
  })

  it('pdfPaths keeps only .pdf files, case-insensitively', () => {
    expect(pdfPaths(['a.pdf', 'B.PDF', 'c.txt', 'd.pdf.exe', 'e.Pdf'])).toEqual([
      'a.pdf',
      'B.PDF',
      'e.Pdf',
    ])
  })

  it('opens only PDFs from drag-drop, open-files event and launch args', async () => {
    h.launch = ['l.PDF', 'l.png']
    const open = vi.fn(async () => {})
    const dispose = initFileOpening(open)
    await flush()
    h.dragCb!({ payload: { type: 'drop', paths: ['d.pdf', 'x.doc'] } })
    h.dragCb!({ payload: { type: 'over' } })
    h.eventCb!({ payload: ['e.pdf', 'y.txt'] })
    await flush()
    expect(open.mock.calls.map((c) => c[0]).sort()).toEqual(['d.pdf', 'e.pdf', 'l.PDF'])
    dispose()
  })

  it('pickAndOpen reuses the handler given to initFileOpening', async () => {
    const open = vi.fn(async () => {})
    const dispose = initFileOpening(open)
    h.picked = ['p1.pdf', 'p2.pdf']
    await pickAndOpen()
    expect(open.mock.calls.map((c) => c[0])).toEqual(['p1.pdf', 'p2.pdf'])
    h.picked = null
    await pickAndOpen()
    expect(open).toHaveBeenCalledTimes(2)
    dispose()
  })
})
