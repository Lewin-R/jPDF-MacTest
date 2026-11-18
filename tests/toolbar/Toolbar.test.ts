import { fireEvent, render, within } from '@testing-library/svelte'
import { tick } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Toolbar from '../../src/toolbar/Toolbar.svelte'
import { fakeSetup } from './fakeTools'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

function mount(setup = fakeSetup()) {
  const r = render(Toolbar, { props: { registry: setup.registry, store: setup.store } })
  return { ...r, ...setup }
}

/** Tool instance buttons (the "+" button has no aria-pressed). */
const toolButtons = (r: ReturnType<typeof mount>) =>
  within(r.getByRole('toolbar')).getAllByRole('button').filter((b) => b.hasAttribute('aria-pressed'))

describe('Toolbar', () => {
  it('renders one button per instance', () => {
    const r = mount(fakeSetup([
      { instanceId: 'p1', type: 'pen', settings: { width: 2, color: [1, 0, 0] } },
      { instanceId: 'p2', type: 'pen', settings: { width: 2, color: [0, 0, 1] } },
      { instanceId: 'h1', type: 'hand', settings: {} },
    ]))
    const buttons = toolButtons(r)
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual(['Pen', 'Pen', 'Hand'])
    // Icons receive the instance's own settings (colour-aware).
    expect([...r.container.querySelectorAll('.fake-icon')].map((i) => i.getAttribute('data-color')))
      .toEqual(['1,0,0', '0,0,1', null])
  })

  it('hides instances of unregistered tool types', () => {
    const r = mount(fakeSetup([
      { instanceId: 'p1', type: 'pen', settings: { width: 2 } },
      { instanceId: 'x1', type: 'future', settings: {} },
    ]))
    expect(toolButtons(r)).toHaveLength(1)
  })

  it('clicking inactive instance activates it', async () => {
    const r = mount()
    const [pen, hand] = toolButtons(r)
    expect(pen.getAttribute('aria-pressed')).toBe('true')
    await fireEvent.click(hand)
    expect(r.store.data.activeInstanceId).toBe('h1')
    expect(hand.getAttribute('aria-pressed')).toBe('true')
    expect(r.queryByRole('dialog')).toBeNull()
  })

  it('clicking active instance opens options flyout', async () => {
    const r = mount()
    await fireEvent.click(toolButtons(r)[0])
    const flyout = r.getByRole('dialog', { name: 'Pen options' })
    await fireEvent.click(within(flyout).getByRole('button', { name: 'Width 2' }))
    expect(r.store.data.toolbar[0].settings).toMatchObject({ width: 3 })
    // Clicking the active tool again toggles the flyout closed.
    await fireEvent.pointerDown(toolButtons(r)[0])
    await fireEvent.click(toolButtons(r)[0])
    expect(r.queryByRole('dialog')).toBeNull()
  })

  it('Escape closes flyout', async () => {
    const r = mount()
    await fireEvent.click(toolButtons(r)[0])
    expect(r.getByRole('dialog')).toBeTruthy()
    const outer = vi.fn()
    window.addEventListener('keydown', outer)
    try {
      await fireEvent.keyDown(document.body, { key: 'Escape' })
      expect(r.queryByRole('dialog')).toBeNull()
      // Consumed by the flyout, not passed on to the keybindings.
      expect(outer).not.toHaveBeenCalled()
      // With nothing open, Escape passes through.
      await fireEvent.keyDown(document.body, { key: 'Escape' })
      expect(outer).toHaveBeenCalledOnce()
    } finally {
      window.removeEventListener('keydown', outer)
    }
  })

  it('outside click closes flyout', async () => {
    const r = mount()
    await fireEvent.click(toolButtons(r)[0])
    await fireEvent.pointerDown(document.body)
    expect(r.queryByRole('dialog')).toBeNull()
  })

  it('a tool without options says so in its flyout', async () => {
    const r = mount()
    await fireEvent.click(toolButtons(r)[1])
    await fireEvent.click(toolButtons(r)[1])
    expect(within(r.getByRole('dialog', { name: 'Hand options' })).getByText('No options')).toBeTruthy()
  })

  it('"+" opens picker listing registered tools with description', async () => {
    const r = mount()
    await fireEvent.click(r.getByRole('button', { name: 'Add tool' }))
    const picker = r.getByRole('dialog', { name: 'Add tool' })
    expect(within(picker).getByText('Pen')).toBeTruthy()
    expect(within(picker).getByText('pen description')).toBeTruthy()
    expect(within(picker).getByText('hand description')).toBeTruthy()
  })

  it('choosing a tool in picker appends instance and closes picker', async () => {
    const r = mount()
    await fireEvent.click(r.getByRole('button', { name: 'Add tool' }))
    await fireEvent.click(within(r.getByRole('dialog', { name: 'Add tool' })).getByRole('button', { name: /Pen/ }))
    expect(r.store.data.toolbar.map((i) => i.type)).toEqual(['pen', 'hand', 'pen'])
    expect(r.store.data.activeInstanceId).toBe(r.store.data.toolbar[2].instanceId)
    expect(r.queryByRole('dialog')).toBeNull()
    expect(toolButtons(r)).toHaveLength(3)
  })

  it('Escape and backdrop click close the picker', async () => {
    const r = mount()
    await fireEvent.click(r.getByRole('button', { name: 'Add tool' }))
    await fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(r.queryByRole('dialog')).toBeNull()
    await fireEvent.click(r.getByRole('button', { name: 'Add tool' }))
    await fireEvent.pointerDown(r.container.ownerDocument.querySelector('.backdrop')!)
    expect(r.queryByRole('dialog')).toBeNull()
  })

  it('right-click menu: Duplicate and Remove; Duplicate hidden for single-instance tools', async () => {
    const r = mount()
    await fireEvent.contextMenu(toolButtons(r)[1])
    let menu = r.getByRole('menu')
    expect(within(menu).getAllByRole('menuitem').map((m) => m.textContent?.trim())).toEqual(['Options', 'Remove'])
    await fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(r.queryByRole('menu')).toBeNull()

    await fireEvent.contextMenu(toolButtons(r)[0])
    menu = r.getByRole('menu')
    await fireEvent.click(within(menu).getByRole('menuitem', { name: 'Duplicate' }))
    expect(r.store.data.toolbar.map((i) => i.type)).toEqual(['pen', 'pen', 'hand'])
    expect(r.queryByRole('menu')).toBeNull()

    await fireEvent.contextMenu(toolButtons(r)[2])
    await fireEvent.click(within(r.getByRole('menu')).getByRole('menuitem', { name: 'Remove' }))
    expect(r.store.data.toolbar.map((i) => i.type)).toEqual(['pen', 'pen'])
  })

  it('right-click Options opens the flyout for that instance', async () => {
    const r = mount()
    await fireEvent.contextMenu(toolButtons(r)[1])
    await fireEvent.click(within(r.getByRole('menu')).getByRole('menuitem', { name: 'Options' }))
    expect(r.getByRole('dialog', { name: 'Hand options' })).toBeTruthy()
  })

  it('drag past the threshold reorders and does not count as a click', async () => {
    const r = mount(fakeSetup([
      { instanceId: 'a', type: 'pen', settings: { width: 1 } },
      { instanceId: 'b', type: 'pen', settings: { width: 2 } },
      { instanceId: 'c', type: 'hand', settings: {} },
    ]))
    const buttons = toolButtons(r)
    // jsdom has no layout: stack the buttons 48px apart.
    buttons.forEach((b, i) => {
      b.getBoundingClientRect = () =>
        ({ top: i * 48, bottom: i * 48 + 40, left: 0, right: 40, width: 40, height: 40, x: 0, y: i * 48 }) as DOMRect
    })
    await fireEvent.pointerDown(buttons[0], { button: 0, clientX: 20, clientY: 20, pointerId: 1 })
    await fireEvent.pointerMove(buttons[0], { clientX: 20, clientY: 22, pointerId: 1 })
    await fireEvent.pointerMove(buttons[0], { clientX: 20, clientY: 130, pointerId: 1 })
    await fireEvent.pointerUp(buttons[0], { clientX: 20, clientY: 130, pointerId: 1 })
    await fireEvent.click(buttons[0])
    await tick()
    expect(r.store.data.toolbar.map((i) => i.instanceId)).toEqual(['b', 'c', 'a'])
    expect(r.store.data.activeInstanceId).toBe('a')
    expect(r.queryByRole('dialog')).toBeNull()
  })

  it('a small wobble below the threshold is still a click', async () => {
    const r = mount()
    const [, hand] = toolButtons(r)
    await fireEvent.pointerDown(hand, { button: 0, clientX: 20, clientY: 20, pointerId: 1 })
    await fireEvent.pointerMove(hand, { clientX: 22, clientY: 23, pointerId: 1 })
    await fireEvent.pointerUp(hand, { clientX: 22, clientY: 23, pointerId: 1 })
    await fireEvent.click(hand)
    expect(r.store.data.activeInstanceId).toBe('h1')
    expect(r.store.data.toolbar.map((i) => i.instanceId)).toEqual(['p1', 'h1'])
  })
})
