import { describe, expect, it } from 'vitest'
import { portal } from '../../src/ui/portal'

describe('portal', () => {
  it('moves the node to the document body and removes it on destroy', () => {
    const page = document.createElement('div')
    const node = document.createElement('div')
    page.appendChild(node)
    const action = portal(node)
    expect(node.parentElement).toBe(document.body)
    expect(page.contains(node)).toBe(false)
    action.destroy()
    expect(node.isConnected).toBe(false)
  })
})
