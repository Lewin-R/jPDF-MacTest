import { fireEvent, render, screen } from '@testing-library/svelte'
import { tick } from 'svelte'
import { describe, expect, it } from 'vitest'
import ConfirmClose, { askToSave } from '../../src/app/ConfirmClose.svelte'

describe('ConfirmClose', () => {
  it('asks to save the named file and resolves with the clicked choice', async () => {
    render(ConfirmClose)
    for (const [label, choice] of [['Save', 'save'], ["Don't save", 'discard'], ['Cancel', 'cancel']]) {
      const answer = askToSave('lecture.pdf')
      await tick()
      expect(screen.getByText('Save changes to lecture.pdf?')).toBeTruthy()
      await fireEvent.click(screen.getByRole('button', { name: label }))
      expect(await answer).toBe(choice)
      await tick()
      expect(screen.queryByRole('dialog')).toBeNull()
    }
  })

  it('Escape cancels', async () => {
    render(ConfirmClose)
    const answer = askToSave('a.pdf')
    await tick()
    await fireEvent.keyDown(document, { key: 'Escape' })
    expect(await answer).toBe('cancel')
  })

  it('a newer prompt cancels the open one', async () => {
    render(ConfirmClose)
    const first = askToSave('a.pdf')
    const second = askToSave('b.pdf')
    expect(await first).toBe('cancel')
    await tick()
    expect(screen.getByText('Save changes to b.pdf?')).toBeTruthy()
    await fireEvent.click(screen.getByRole('button', { name: "Don't save" }))
    expect(await second).toBe('discard')
  })
})
