import { fireEvent, render } from '@testing-library/svelte'
import { tick } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Toast from '../../src/ui/Toast.svelte'
import { ToastStore } from '../../src/ui/toasts.svelte'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('ToastStore', () => {
  it('auto-dismisses info after 4 s and errors after 8 s', () => {
    const t = new ToastStore()
    t.show('hello')
    t.show('bad', 'error')
    vi.advanceTimersByTime(4000)
    expect(t.items.map((i) => i.message)).toEqual(['bad'])
    vi.advanceTimersByTime(4000)
    expect(t.items).toEqual([])
  })

  it('keeps at most 3, dropping the oldest', () => {
    const t = new ToastStore()
    for (const m of ['a', 'b', 'c', 'd']) t.show(m)
    expect(t.items.map((i) => i.message)).toEqual(['b', 'c', 'd'])
  })

  it('dismiss removes a toast', () => {
    const t = new ToastStore()
    const id = t.show('x')
    t.dismiss(id)
    expect(t.items).toEqual([])
  })
})

describe('Toast', () => {
  it('renders toasts; the action runs and dismisses', async () => {
    const t = new ToastStore()
    const run = vi.fn()
    const { getByText, getByRole, queryByText } = render(Toast, { props: { store: t } })
    t.show('Save failed', 'error', { label: 'Save As…', run })
    await tick()
    expect(getByText('Save failed')).toBeTruthy()
    expect(getByRole('alert')).toBeTruthy()
    await fireEvent.click(getByRole('button', { name: 'Save As…' }))
    expect(run).toHaveBeenCalledOnce()
    expect(queryByText('Save failed')).toBeNull()
  })
})
