import { describe, expect, it, vi } from 'vitest'
import { MergeFiles, rowError, type PdfInfo } from '../../src/builder/merge/mergeFiles.svelte'

const flush = () => new Promise((r) => setTimeout(r, 0))

/** A reader whose reads finish when the test says so. */
function controlledReader() {
  const pending = new Map<string, { resolve: (i: PdfInfo) => void; reject: (e: unknown) => void }>()
  const read = vi.fn(
    (path: string) => new Promise<PdfInfo>((resolve, reject) => pending.set(path, { resolve, reject })),
  )
  return { read, pending }
}

describe('MergeFiles', () => {
  it('lists added files at once and fills in their page counts', async () => {
    const files = new MergeFiles(['C:\\a\\one.pdf', 'C:\\a\\two.pdf'], async (p) => ({ pages: p.includes('one') ? 3 : 5, thumb: null }), 44)
    expect(files.items.map((i) => [i.name, i.pages])).toEqual([['one.pdf', null], ['two.pdf', null]])
    await flush()
    expect(files.items.map((i) => i.pages)).toEqual([3, 5])
  })

  it('reads at most two files at a time', async () => {
    const { read, pending } = controlledReader()
    const files = new MergeFiles(['a.pdf', 'b.pdf', 'c.pdf'], read, 44)
    expect(read.mock.calls.map((c) => c[0])).toEqual(['a.pdf', 'b.pdf'])
    pending.get('a.pdf')!.resolve({ pages: 1, thumb: null })
    await flush()
    expect(read.mock.calls.map((c) => c[0])).toEqual(['a.pdf', 'b.pdf', 'c.pdf'])
    files.dispose()
  })

  it('a file that cannot be read shows why on its row', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const files = new MergeFiles(['x.pdf', 'y.pdf'], async (p) => {
      if (p === 'x.pdf') throw { code: 'Encrypted', message: 'locked' }
      throw new Error('boom')
    }, 44)
    await flush()
    expect(files.items.map((i) => i.error)).toEqual(['Password-protected', 'Could not be read'])
    err.mockRestore()
  })

  it('a file removed while reading stays removed', async () => {
    const { read, pending } = controlledReader()
    const files = new MergeFiles(['a.pdf', 'b.pdf'], read, 44)
    files.remove(files.items[0].id)
    pending.get('a.pdf')!.resolve({ pages: 2, thumb: null })
    await flush()
    expect(files.items.map((i) => i.path)).toEqual(['b.pdf'])
  })

  it('a removed file waiting in the queue is never read', async () => {
    const { read, pending } = controlledReader()
    const files = new MergeFiles(['a.pdf', 'b.pdf', 'c.pdf'], read, 44)
    files.remove(files.items[2].id)
    pending.get('a.pdf')!.resolve({ pages: 1, thumb: null })
    await flush()
    expect(read.mock.calls.map((c) => c[0])).toEqual(['a.pdf', 'b.pdf'])
  })

  it('the same file may be listed twice', () => {
    const files = new MergeFiles(['a.pdf', 'a.pdf'], async () => ({ pages: 1, thumb: null }), 44)
    expect(new Set(files.items.map((i) => i.id)).size).toBe(2)
  })

  it('move reorders the list', () => {
    const files = new MergeFiles(['a.pdf', 'b.pdf', 'c.pdf'], async () => ({ pages: 1, thumb: null }), 44)
    files.move(2, 0)
    expect(files.items.map((i) => i.path)).toEqual(['c.pdf', 'a.pdf', 'b.pdf'])
  })

  it('nothing more is read after dispose', async () => {
    const { read, pending } = controlledReader()
    const files = new MergeFiles(['a.pdf', 'b.pdf', 'c.pdf'], read, 44)
    files.dispose()
    pending.get('a.pdf')!.resolve({ pages: 1, thumb: null })
    await flush()
    expect(read).toHaveBeenCalledTimes(2)
    expect(files.items[0].pages).toBeNull()
  })

  it('rowError maps app errors to short reasons', () => {
    expect(rowError({ code: 'NotFound', message: '' })).toBe('File not found')
    expect(rowError({ code: 'InvalidPdf', message: '' })).toBe('Not a readable PDF')
    expect(rowError('nope')).toBe('Could not be read')
  })
})
