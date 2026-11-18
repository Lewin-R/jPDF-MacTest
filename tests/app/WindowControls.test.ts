import { render, fireEvent } from '@testing-library/svelte'
import { describe, expect, it, vi } from 'vitest'

const win = vi.hoisted(() => ({
  minimize: vi.fn(),
  toggleMaximize: vi.fn(),
  close: vi.fn(),
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
})
