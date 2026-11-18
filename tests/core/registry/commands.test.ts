import { describe, expect, it, vi } from 'vitest'
import { CommandRegistry } from '../../../src/core/registry/commands'

describe('CommandRegistry', () => {
  it('execute runs registered command and returns true', async () => {
    const reg = new CommandRegistry()
    const run = vi.fn()
    reg.register({ id: 'a', title: 'A', run })
    expect(await reg.execute('a')).toBe(true)
    expect(run).toHaveBeenCalledOnce()
  })

  it('execute returns false for unknown id', async () => {
    expect(await new CommandRegistry().execute('nope')).toBe(false)
  })

  it('execute returns false and does not run when enabled() is false', async () => {
    const reg = new CommandRegistry()
    const run = vi.fn()
    reg.register({ id: 'a', title: 'A', run, enabled: () => false })
    expect(await reg.execute('a')).toBe(false)
    expect(run).not.toHaveBeenCalled()
  })

  it('register returns disposer that unregisters', async () => {
    const reg = new CommandRegistry()
    const dispose = reg.register({ id: 'a', title: 'A', run: () => {} })
    expect(reg.has('a')).toBe(true)
    dispose()
    expect(reg.has('a')).toBe(false)
    expect(await reg.execute('a')).toBe(false)
  })

  it('awaits async commands', async () => {
    const reg = new CommandRegistry()
    let done = false
    reg.register({
      id: 'a',
      title: 'A',
      run: async () => {
        await Promise.resolve()
        done = true
      },
    })
    await reg.execute('a')
    expect(done).toBe(true)
  })

  it('propagates errors thrown by run()', async () => {
    const reg = new CommandRegistry()
    reg.register({ id: 'a', title: 'A', run: () => { throw new Error('boom') } })
    await expect(reg.execute('a')).rejects.toThrow('boom')
  })

  it('disposer of a replaced registration does not remove the newer one', () => {
    const reg = new CommandRegistry()
    const d1 = reg.register({ id: 'a', title: 'A1', run: () => {} })
    reg.register({ id: 'a', title: 'A2', run: () => {} })
    d1()
    expect(reg.has('a')).toBe(true)
  })
})
