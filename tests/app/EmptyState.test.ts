import { render, fireEvent } from '@testing-library/svelte'
import { describe, expect, it, vi } from 'vitest'
import EmptyState from '../../src/app/EmptyState.svelte'

describe('EmptyState', () => {
  it('calls onOpen when Open PDF is clicked', async () => {
    const onOpen = vi.fn()
    const { getByRole } = render(EmptyState, { props: { onOpen } })
    await fireEvent.click(getByRole('button', { name: 'Open PDF' }))
    expect(onOpen).toHaveBeenCalledOnce()
  })

  it('shows the full juliePDF logo', () => {
    const { getByText } = render(EmptyState, { props: { onOpen: vi.fn() } })
    expect(getByText('julie').className).toContain('logo-j')
  })
})
