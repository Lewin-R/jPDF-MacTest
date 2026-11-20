import { fireEvent, render } from '@testing-library/svelte'
import { createRawSnippet } from 'svelte'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  saved: null as string | null,
  picked: null as string[] | null,
  open: new Map<string, { fileName: string; dirty: boolean }>(),
  merge: vi.fn(async (_paths: string[], _target: string) => {}),
  exists: vi.fn(async (_p: string) => false),
  saveSession: vi.fn(async () => true),
}))

vi.mock('@tauri-apps/plugin-dialog', () => ({
  save: async () => h.saved,
  open: async () => h.picked,
}))
vi.mock('../../src/core/ipc/api', async (orig) => ({
  ...(await orig<typeof import('../../src/core/ipc/api')>()),
  mergePdfs: h.merge,
  pathExists: h.exists,
}))
vi.mock('../../src/app/tabs.svelte', () => ({ tabs: { findByPath: (p: string) => h.open.get(p) } }))
vi.mock('../../src/app/saveFlow', () => ({ saveSession: h.saveSession }))

import MergePage from '../../src/builder/merge/MergePage.svelte'
import { MergeFiles } from '../../src/builder/merge/mergeFiles.svelte'
import { toasts } from '../../src/ui/toasts.svelte'

// jsdom has no Web Animations (animate:flip uses them).
Element.prototype.getAnimations ??= () => []
Element.prototype.animate ??= function () {
  return { cancel() {}, finished: Promise.resolve(), set onfinish(f: () => void) { f() } } as unknown as Animation
}

const flush = () => new Promise((r) => setTimeout(r, 0))
const heading = createRawSnippet(() => ({ render: () => '<h1>Merge PDFs</h1>' }))

function setup(paths: string[]) {
  const files = new MergeFiles(paths, async () => ({ pages: 2, thumb: null }), 44)
  const onmerged = vi.fn()
  const onclose = vi.fn()
  const utils = render(MergePage, { props: { files, heading, onmerged, onclose } })
  return { files, onmerged, onclose, ...utils }
}

describe('MergePage', () => {
  beforeEach(() => {
    h.saved = null
    h.picked = null
    h.open.clear()
    h.merge.mockClear()
    h.exists.mockClear()
    h.saveSession.mockClear()
    toasts.items.splice(0)
  })

  it('lists the files with their page counts and the total', async () => {
    const { getByText, findByText } = setup(['C:\\d\\a.pdf', 'C:\\d\\b.pdf'])
    await findByText('2 files · 4 pages')
    expect(getByText('a.pdf')).toBeTruthy()
  })

  it('Merge stays disabled with one file', async () => {
    const { getByRole } = setup(['C:\\d\\a.pdf'])
    await flush()
    expect((getByRole('button', { name: 'Merge…' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('merges into the chosen file and reports it', async () => {
    h.saved = 'C:\\d\\out.pdf'
    const { getByRole, onmerged } = setup(['C:\\d\\a.pdf', 'C:\\d\\b.pdf'])
    await flush()
    await fireEvent.click(getByRole('button', { name: 'Merge…' }))
    await flush()
    expect(h.merge).toHaveBeenCalledWith(['C:\\d\\a.pdf', 'C:\\d\\b.pdf'], 'C:\\d\\out.pdf')
    expect(onmerged).toHaveBeenCalledWith('C:\\d\\out.pdf')
  })

  it('a listed file with unsaved changes stops the merge and offers to save it', async () => {
    h.open.set('C:\\d\\a.pdf', { fileName: 'a.pdf', dirty: true })
    h.saved = 'C:\\d\\out.pdf'
    const { getByRole } = setup(['C:\\d\\a.pdf', 'C:\\d\\b.pdf'])
    await flush()
    await fireEvent.click(getByRole('button', { name: 'Merge…' }))
    await flush()
    expect(h.merge).not.toHaveBeenCalled()
    const toast = toasts.items.at(-1)!
    expect(toast.message).toContain('a.pdf has unsaved changes')
    toast.action!.run()
    expect(h.saveSession).toHaveBeenCalledWith(h.open.get('C:\\d\\a.pdf'))
  })

  it('refuses a target that is open in a tab', async () => {
    h.open.set('C:\\d\\open.pdf', { fileName: 'open.pdf', dirty: false })
    h.saved = 'C:\\d\\open.pdf'
    const { getByRole, onmerged } = setup(['C:\\d\\a.pdf', 'C:\\d\\b.pdf'])
    await flush()
    await fireEvent.click(getByRole('button', { name: 'Merge…' }))
    await flush()
    expect(h.merge).not.toHaveBeenCalled()
    expect(onmerged).not.toHaveBeenCalled()
    expect(toasts.items.at(-1)!.message).toContain('open in a tab')
  })

  it('a failed merge shows the error and keeps the page', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    h.saved = 'C:\\d\\out.pdf'
    h.merge.mockRejectedValueOnce({ code: 'Encrypted', message: 'b.pdf: the PDF is encrypted' })
    const { getByRole, onmerged } = setup(['C:\\d\\a.pdf', 'C:\\d\\b.pdf'])
    await flush()
    await fireEvent.click(getByRole('button', { name: 'Merge…' }))
    await flush()
    expect(onmerged).not.toHaveBeenCalled()
    expect(toasts.items.at(-1)!.message).toBe('Could not merge: b.pdf: the PDF is encrypted')
    err.mockRestore()
  })

  it('Alt+ArrowDown moves a row, Delete removes it', async () => {
    const { getAllByRole, files } = setup(['C:\\d\\a.pdf', 'C:\\d\\b.pdf', 'C:\\d\\c.pdf'])
    await flush()
    await fireEvent.keyDown(getAllByRole('option')[0], { key: 'ArrowDown', altKey: true })
    expect(files.items.map((i) => i.name)).toEqual(['b.pdf', 'a.pdf', 'c.pdf'])
    await fireEvent.keyDown(getAllByRole('option')[2], { key: 'Delete' })
    expect(files.items.map((i) => i.name)).toEqual(['b.pdf', 'a.pdf'])
  })

  it('Escape closes the page', async () => {
    const { onclose } = setup(['C:\\d\\a.pdf'])
    await fireEvent.keyDown(window, { key: 'Escape' })
    expect(onclose).toHaveBeenCalledOnce()
  })
})
