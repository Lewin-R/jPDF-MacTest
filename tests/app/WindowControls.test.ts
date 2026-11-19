import { render, fireEvent } from '@testing-library/svelte'
import { describe, expect, it, vi } from 'vitest'

const win = vi.hoisted(() => ({
  minimize: vi.fn(async () => {}),
  toggleMaximize: vi.fn(async () => {}),
  close: vi.fn(async () => {}),
}))
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => win }))

import WindowControls from '../../src/app/WindowControls.svelte'

describe('WindowControls', () => {
  it('renders three labelled buttons wired to the window', async () => {
    const { getAllByRole, getByLabelText } = render(WindowControls)
    expect(getAllByRole('button')).toHaveLength(3)
    await fireEvent.click(getByLabelText('Minimize'))
    await fireEvent.click(getByLabelText('Maximize'))
    await fireEvent.click(getByLabelText('Close'))
    expect(win.minimize).toHaveBeenCalled()
    expect(win.toggleMaximize).toHaveBeenCalled()
    expect(win.close).toHaveBeenCalled()
  })

  it('logs a failed window call instead of leaving the promise unhandled', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const failure = new Error('not allowed')
    win.minimize.mockRejectedValueOnce(failure)
    const { getByLabelText } = render(WindowControls)
    await fireEvent.click(getByLabelText('Minimize'))
    await vi.waitFor(() => expect(error).toHaveBeenCalledWith(failure))
    error.mockRestore()
  })
})
