import { describe, expect, it } from 'vitest'
import { createToolRegistry, type ToolDefinition } from '../../../src/core/registry/tools'

function def(type: string): ToolDefinition {
  return {
    type, displayName: type, description: '', Icon: null as never, defaultSettings: {},
    Options: null, allowMultipleInstances: true, createHandler: () => ({}),
  }
}

describe('toolRegistry', () => {
  it('register then get', () => {
    const r = createToolRegistry()
    const d = def('pen')
    r.register(d)
    expect(r.get('pen')).toBe(d)
  })

  it('list preserves registration order', () => {
    const r = createToolRegistry()
    r.register(def('b'))
    r.register(def('a'))
    r.register(def('c'))
    expect(r.list().map((d) => d.type)).toEqual(['b', 'a', 'c'])
  })

  it('registering duplicate type throws', () => {
    const r = createToolRegistry()
    r.register(def('pen'))
    expect(() => r.register(def('pen'))).toThrow()
  })

  it('get of unknown type throws', () => {
    expect(() => createToolRegistry().get('nope')).toThrow()
  })
})
