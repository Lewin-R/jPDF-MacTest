import { fireEvent, render } from '@testing-library/svelte'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  exportCleanCopy: vi.fn(async (..._args: unknown[]) => true),
}))
vi.mock('../../src/builder/export/exportFlow', () => ({ exportCleanCopy: h.exportCleanCopy }))

import ExportMenu from '../../src/builder/export/ExportMenu.svelte'
import type { DocumentSession } from '../../src/core/session/session.svelte'

const flush = () => new Promise((r) => setTimeout(r, 0))
const session = { path: 'C:\\docs\\a.pdf' } as unknown as DocumentSession

function setup() {
  const onopen = vi.fn()
  const utils = render(ExportMenu, { props: { session, onopen } })
  const button = () => utils.getByRole('button', { name: /Export/ })
  return { onopen, button, ...utils }
}

describe('ExportMenu', () => {
  beforeEach(() => {
    h.exportCleanCopy.mockReset().mockResolvedValue(true)
  })

  it('opens a menu with "Without annotations…" and runs that export', async () => {
    const { button, getByRole, queryByRole, onopen } = setup()
    expect(queryByRole('menu')).toBeNull()
    await fireEvent.click(button())
    expect(button().getAttribute('aria-expanded')).toBe('true')
    await fireEvent.click(getByRole('menuitem', { name: 'Without annotations…' }))
    expect(queryByRole('menu')).toBeNull()
    expect(h.exportCleanCopy).toHaveBeenCalledWith(session, onopen)
  })

  it('the button is disabled while exporting', async () => {
    let finish!: (v: boolean) => void
    h.exportCleanCopy.mockReturnValue(new Promise<boolean>((r) => (finish = r)))
    const { button, getByRole } = setup()
    await fireEvent.click(button())
    await fireEvent.click(getByRole('menuitem', { name: 'Without annotations…' }))
    expect((button() as HTMLButtonElement).disabled).toBe(true)
    expect(button().textContent).toContain('Exporting…')
    finish(true)
    await flush()
    expect((button() as HTMLButtonElement).disabled).toBe(false)
  })

  it('pressing the button again closes the menu', async () => {
    const { button, queryByRole } = setup()
    await fireEvent.click(button())
    await fireEvent.pointerDown(button())
    await fireEvent.click(button())
    expect(queryByRole('menu')).toBeNull()
  })

  it('Escape and a click elsewhere close the menu', async () => {
    const { button, queryByRole } = setup()
    await fireEvent.click(button())
    await fireEvent.keyDown(window, { key: 'Escape' })
    expect(queryByRole('menu')).toBeNull()
    await fireEvent.click(button())
    await fireEvent.pointerDown(document.body)
    expect(queryByRole('menu')).toBeNull()
    expect(h.exportCleanCopy).not.toHaveBeenCalled()
  })
})
