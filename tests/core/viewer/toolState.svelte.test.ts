import { flushSync } from 'svelte'
import { describe, expect, it, vi } from 'vitest'
import type { Annotation } from '../../../src/core/session/model'
import type { DocumentSession } from '../../../src/core/session/session.svelte'
import { AnnotationStore } from '../../../src/core/session/store.svelte'
import { SessionToolState, ToolRouter } from '../../../src/core/viewer/toolRouting.svelte'

/** A session as production creates it: its tool state exists before any UI reads it. */
function session(): DocumentSession {
  return {
    id: 's1',
    history: { execute: vi.fn() },
    store: new AnnotationStore(),
    toolState: new SessionToolState(),
  } as unknown as DocumentSession
}

const anno = { id: 'live', page: 0, kind: 'ink' } as Annotation

describe('session tool state reactivity', () => {
  it('a derived that is the first to read the tool state still sees later preview changes', () => {
    // Regression: the state used to be created lazily by its first reader. Svelte
    // does not track state created inside the reaction that reads it, so the
    // app's first derived over `preview` stayed null and live strokes never showed.
    const s = session()
    const router = new ToolRouter(() => null, () => s)
    let seen: Annotation | null | 'unset' = 'unset'
    const stop = $effect.root(() => {
      const preview = $derived(router.stateOf(s).preview)
      $effect(() => {
        seen = preview
      })
    })
    flushSync()
    expect(seen).toBeNull()

    router.stateOf(s).preview = anno
    flushSync()
    expect(seen).toBe(anno)

    router.stateOf(s).preview = null
    flushSync()
    expect(seen).toBeNull()
    stop()
  })

  it('stateOf returns the state the session was created with', () => {
    const s = session()
    const router = new ToolRouter(() => null, () => s)
    expect(router.stateOf(s)).toBe((s as unknown as { toolState: SessionToolState }).toolState)
  })
})
