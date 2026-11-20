import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  saved: null as string | null,
  open: new Set<string>(),
  exists: vi.fn(async (_p: string) => false),
  exportPdf: vi.fn(async (..._args: unknown[]) => {}),
}))

vi.mock('@tauri-apps/plugin-dialog', () => ({ save: async () => h.saved }))
vi.mock('../../src/core/ipc/api', async (orig) => ({
  ...(await orig<typeof import('../../src/core/ipc/api')>()),
  exportWithoutAnnotations: h.exportPdf,
  pathExists: h.exists,
}))
vi.mock('../../src/app/tabs.svelte', () => ({
  tabs: { findByPath: (p: string) => (h.open.has(p) ? {} : undefined) },
}))

import { cleanCopyName, exportCleanCopy } from '../../src/builder/export/exportFlow'
import type { InkAnnotation } from '../../src/core/session/model'
import type { PageSpec } from '../../src/core/session/pages'
import type { DocumentSession } from '../../src/core/session/session.svelte'
import { AnnotationStore } from '../../src/core/session/store.svelte'
import { toasts } from '../../src/ui/toasts.svelte'

function ink(id: string, flattened = false): InkAnnotation {
  return {
    kind: 'ink', id, page: 0, sourceRef: null, modifiedAt: '2026-11-20T10:00:00Z', author: 'JuliePDF',
    strokes: [[[0, 0], [10, 10]]], color: [1, 0, 0], width: 2, opacity: 1, blend: 'normal', role: 'pen',
    ...(flattened ? { flattened: true as const } : {}),
  }
}

function fakeSession(opts: { plan?: PageSpec[] | null; annotations?: InkAnnotation[]; broken?: boolean } = {}) {
  const store = new AnnotationStore()
  store.load(opts.annotations ?? [])
  return {
    path: 'C:\\docs\\report.pdf',
    fileName: 'report.pdf',
    broken: opts.broken ?? false,
    store,
    pagePlan: () => (opts.plan ? Promise.resolve(opts.plan) : null),
  } as unknown as DocumentSession
}

describe('exportFlow', () => {
  beforeEach(() => {
    h.saved = null
    h.open.clear()
    h.exists.mockReset().mockResolvedValue(false)
    h.exportPdf.mockReset().mockResolvedValue(undefined)
    toasts.items.splice(0)
  })

  it('suggests "<name> (no annotations).pdf" next to the document', () => {
    expect(cleanCopyName('C:\\docs\\report.pdf')).toBe('C:\\docs\\report (no annotations).pdf')
    expect(cleanCopyName('C:\\docs\\SCAN.PDF')).toBe('C:\\docs\\SCAN (no annotations).pdf')
  })

  it('writes the copy and offers to open it', async () => {
    h.saved = 'C:\\docs\\clean.pdf'
    const open = vi.fn()
    expect(await exportCleanCopy(fakeSession(), open)).toBe(true)
    expect(h.exportPdf).toHaveBeenCalledWith('C:\\docs\\report.pdf', 'C:\\docs\\clean.pdf', [], undefined)
    const toast = toasts.items.at(-1)!
    expect(toast.message).toBe('Exported clean.pdf without annotations')
    toast.action!.run()
    expect(open).toHaveBeenCalledWith('C:\\docs\\clean.pdf')
  })

  it('passes unsaved page changes and only the pending flattened annotations', async () => {
    h.saved = 'C:\\docs\\clean.pdf'
    const plan: PageSpec[] = [{ kind: 'source', index: 1, rotate: 0 }]
    const flat = ink('f', true)
    await exportCleanCopy(fakeSession({ plan, annotations: [ink('a'), flat] }), vi.fn())
    expect(h.exportPdf).toHaveBeenCalledWith('C:\\docs\\report.pdf', 'C:\\docs\\clean.pdf', [flat], plan)
  })

  it('does nothing when the dialog is cancelled', async () => {
    expect(await exportCleanCopy(fakeSession(), vi.fn())).toBe(false)
    expect(h.exportPdf).not.toHaveBeenCalled()
  })

  it('appends .pdf and refuses to replace an existing file the dialog did not confirm', async () => {
    h.saved = 'C:\\docs\\clean'
    h.exists.mockResolvedValue(true)
    expect(await exportCleanCopy(fakeSession(), vi.fn())).toBe(false)
    expect(h.exists).toHaveBeenCalledWith('C:\\docs\\clean.pdf')
    expect(h.exportPdf).not.toHaveBeenCalled()
    expect(toasts.items.at(-1)!.kind).toBe('error')
  })

  it('refuses a target open in a tab, the document itself included', async () => {
    h.saved = 'C:\\docs\\report.pdf'
    h.open.add('C:\\docs\\report.pdf')
    expect(await exportCleanCopy(fakeSession(), vi.fn())).toBe(false)
    expect(h.exportPdf).not.toHaveBeenCalled()
    expect(toasts.items.at(-1)!.message).toContain('open in a tab')
  })

  it('refuses a broken session without asking for a target', async () => {
    h.saved = 'C:\\docs\\clean.pdf'
    expect(await exportCleanCopy(fakeSession({ broken: true }), vi.fn())).toBe(false)
    expect(h.exportPdf).not.toHaveBeenCalled()
    expect(toasts.items.at(-1)!.kind).toBe('error')
  })

  it('shows the error when writing fails', async () => {
    h.saved = 'C:\\docs\\clean.pdf'
    h.exportPdf.mockRejectedValue({ code: 'Locked', message: 'clean.pdf is locked' })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await exportCleanCopy(fakeSession(), vi.fn())).toBe(false)
    expect(toasts.items.at(-1)!.message).toBe('Could not export: clean.pdf is locked')
  })
})
