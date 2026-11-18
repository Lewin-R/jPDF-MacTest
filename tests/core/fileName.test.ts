import { describe, expect, it, vi } from 'vitest'

vi.mock('../../src/core/viewer/pdfEngine', () => ({ loadPdf: vi.fn() }))

import { fileNameOf } from '../../src/core/session/session.svelte'

describe('fileNameOf', () => {
  it('takes the last segment of a Windows path', () => {
    expect(fileNameOf('C:\\Users\\me\\Docs\\report.pdf')).toBe('report.pdf')
  })
  it('handles forward slashes and bare names', () => {
    expect(fileNameOf('/tmp/a.pdf')).toBe('a.pdf')
    expect(fileNameOf('a.pdf')).toBe('a.pdf')
  })
})
