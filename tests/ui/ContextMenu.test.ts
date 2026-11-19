import { fireEvent, render } from '@testing-library/svelte'
import { describe, expect, it, vi } from 'vitest'
import ContextMenu, { type MenuItem } from '../../src/ui/ContextMenu.svelte'

function mount(items: MenuItem[]) {
  const onclose = vi.fn()
  const r = render(ContextMenu, { props: { x: 10, y: 10, items, onclose } })
  const buttons = [...r.container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
  return { ...r, onclose, buttons, menu: r.container.querySelector<HTMLElement>('[role="menu"]')! }
}

describe('ContextMenu disabled items', () => {
  it('renders a disabled item that cannot be chosen', async () => {
    const run = vi.fn()
    const { buttons, onclose } = mount([{ label: 'A', run: vi.fn() }, { label: 'B', disabled: true, run }])
    expect(buttons[1].disabled).toBe(true)
    await fireEvent.click(buttons[1])
    expect(run).not.toHaveBeenCalled()
    expect(onclose).not.toHaveBeenCalled()
  })

  it('arrow keys skip disabled items', async () => {
    const { buttons, menu } = mount([
      { label: 'A', run: vi.fn() },
      { label: 'B', disabled: true, run: vi.fn() },
      { label: 'C', run: vi.fn() },
    ])
    buttons[0].focus()
    await fireEvent.keyDown(menu, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(buttons[2])
    await fireEvent.keyDown(menu, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(buttons[0])
    await fireEvent.keyDown(menu, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(buttons[2])
  })

  it('focuses the first enabled item on open', () => {
    const { buttons } = mount([{ label: 'A', disabled: true, run: vi.fn() }, { label: 'B', run: vi.fn() }])
    expect(document.activeElement).toBe(buttons[1])
  })
})
