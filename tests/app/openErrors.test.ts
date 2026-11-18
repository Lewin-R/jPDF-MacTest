import { describe, expect, it } from 'vitest'
import { openErrorMessage } from '../../src/app/openErrors'

describe('openErrorMessage', () => {
  it('gives friendly messages for known error codes', () => {
    expect(openErrorMessage({ code: 'Encrypted', message: 'pw' }, 'a.pdf')).toBe('Encrypted PDFs are not supported yet')
    expect(openErrorMessage({ code: 'InvalidPdf', message: 'x' }, 'a.pdf')).toBe('This file could not be opened as a PDF')
    expect(openErrorMessage({ code: 'NotFound', message: 'x' }, 'a.pdf')).toBe('File not found')
    expect(openErrorMessage({ code: 'Locked', message: 'x' }, 'a.pdf')).toBe('The file is locked by another program')
  })

  it('falls back to a generic message with the file name', () => {
    expect(openErrorMessage({ code: 'Io', message: 'disk' }, 'C:\\docs\\b.pdf')).toBe('Could not open b.pdf')
    expect(openErrorMessage(new Error('boom'), 'C:/x/c.pdf')).toBe('Could not open c.pdf')
  })
})
