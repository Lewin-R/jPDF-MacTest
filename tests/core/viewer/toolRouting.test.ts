import { flushSync } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ToolContext, ToolHandler } from '../../../src/core/registry/tools'
import type { Annotation } from '../../../src/core/session/model'
import type { DocumentSession } from '../../../src/core/session/session.svelte'
import { ToolRouter } from '../../../src/core/viewer/toolRouting.svelte'
import { ActiveTool } from '../../../src/toolbar/activeTool.svelte'
import { fakeSetup, fakeTool } from '../../toolbar/fakeTools'

function fakeSession(id: string) {
  return { id, history: { execute: vi.fn() } } as unknown as DocumentSession
}

const anno = (page: number) => ({ id: 'x', page, kind: 'ink' }) as Annotation

function setup() {
  const s = fakeSetup([
    { instanceId: 'p1', type: 'pen', settings: { width: 2 } },
    { instanceId: 'p2', type: 'pen', settings: { width: 5 } },
    { instanceId: 'x1', type: 'future', settings: {} },
  ])
  const created: { ctx: ToolContext; settings: () => unknown; handler: Required<Pick<ToolHandler, 'onDeactivate'>> }[] = []
  // Replace pen with a spying fake.
  const registry = s.registry
  const pen = registry.get('pen')
  pen.createHandler = (ctx, settings) => {
    const handler = { onDeactivate: vi.fn() }
    created.push({ ctx, settings, handler })
    return handler
  }
  const active = new ActiveTool(s.store, registry)
  let session: DocumentSession | null = fakeSession('s1')
  const router = new ToolRouter(() => active.current, () => session)
  return {
    ...s, active, router, created,
    setSession: (x: DocumentSession | null) => (session = x),
  }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('ActiveTool', () => {
  it('pairs the active instance with its definition', () => {
    const { active, store } = setup()
    expect(active.current?.def.type).toBe('pen')
    expect(active.current?.instance.instanceId).toBe('p1')
    store.setActive('x1')
    expect(active.current).toBeNull()
  })
})

describe('ToolRouter', () => {
  it('creates a handler for the active tool with live settings', () => {
    const { router, created, store } = setup()
    router.sync()
    expect(created).toHaveLength(1)
    expect(router.handler).toBe(created[0].handler)
    expect(created[0].settings()).toEqual({ width: 2 })
    store.updateSettings('p1', { width: 7 })
    expect(created[0].settings()).toEqual({ width: 7 })
    // Settings changes do not recreate the handler.
    router.sync()
    expect(created).toHaveLength(1)
  })

  it('switching instance deactivates the old handler and creates a new one', () => {
    const { router, created, store } = setup()
    router.sync()
    store.setActive('p2')
    router.sync()
    expect(created[0].handler.onDeactivate).toHaveBeenCalledOnce()
    expect(created).toHaveLength(2)
    expect(created[1].settings()).toEqual({ width: 5 })
  })

  it('no session or an unregistered active tool means no handler', () => {
    const { router, created, store, setSession } = setup()
    setSession(null)
    router.sync()
    expect(router.handler).toBeNull()
    setSession(fakeSession('s2'))
    router.sync()
    expect(router.handler).not.toBeNull()
    store.setActive('x1')
    router.sync()
    expect(router.handler).toBeNull()
    expect(created[0].handler.onDeactivate).toHaveBeenCalledOnce()
  })

  it('context executes on the session history and keeps preview and selection per session', () => {
    const { router, created, setSession } = setup()
    router.sync()
    const ctx = created[0].ctx
    const s1 = ctx.session
    const cmd = { label: 'x', do() {}, undo() {} }
    ctx.execute(cmd)
    expect(s1.history.execute).toHaveBeenCalledWith(cmd)

    ctx.preview.set(anno(3))
    ctx.selection.set(['a', 'b'])
    expect(ctx.selection.ids).toEqual(['a', 'b'])
    expect(router.stateOf(s1).preview?.page).toBe(3)

    const s2 = fakeSession('s2')
    setSession(s2)
    router.sync()
    expect(created[0].handler.onDeactivate).toHaveBeenCalledOnce()
    expect(created[1].ctx.session).toBe(s2)
    expect(created[1].ctx.selection.ids).toEqual([])
    // The old session's selection survives, its uncommitted preview does not.
    expect(router.stateOf(s1).selection).toEqual(['a', 'b'])
    expect(router.stateOf(s1).preview).toBeNull()
  })

  it('start() follows the active tool reactively; stop deactivates', () => {
    const { router, created, store } = setup()
    const stop = router.start()
    expect(created).toHaveLength(1)
    store.setActive('p2')
    flushSync()
    expect(created).toHaveLength(2)
    stop()
    expect(created[1].handler.onDeactivate).toHaveBeenCalledOnce()
    expect(router.handler).toBeNull()
  })

  it('exposes the tool cursor', () => {
    const { router, registry, store } = setup()
    registry.get('pen').cursor = (s: { width: number }) => `cell-${s.width}`
    expect(router.cursor).toBe('cell-2')
    store.updateSettings('p1', { width: 4 })
    expect(router.cursor).toBe('cell-4')
    store.setActive('x1')
    expect(router.cursor).toBeUndefined()
    registry.register(fakeTool('plain'))
    store.addInstance('plain')
    store.setActive(store.data.toolbar.at(-1)!.instanceId)
    expect(router.cursor).toBeUndefined()
  })
})
