import { untrack } from 'svelte'
import type { ToolContext, ToolDefinition, ToolHandler } from '../registry/tools'
import type { DocumentSession } from '../session/session.svelte'
import { SessionToolState } from '../session/toolState.svelte'
import type { ToolInstance } from '../settings/settings.svelte'

interface ActiveToolLike {
  def: ToolDefinition
  instance: ToolInstance
}

export { SessionToolState }

/**
 * Owns the active tool's ToolHandler. The handler is created (with a
 * ToolContext for the active session) whenever the active instance or the
 * session changes; the previous handler gets onDeactivate. Settings changes
 * reach the handler through its live settings getter, without recreating it.
 * Overlays forward pointer input to `handler`.
 */
export class ToolRouter {
  handler: ToolHandler | null = $state.raw(null)

  readonly cursor: string | undefined = $derived.by(() => {
    const a = this.getActive()
    const session = this.getSession()
    const override = session ? this.stateOf(session).cursor : null
    return override ?? a?.def.cursor?.(a.instance.settings)
  })

  private states = new WeakMap<DocumentSession, SessionToolState>()
  private key: { instanceId: string; session: DocumentSession } | null = null

  constructor(
    private getActive: () => ActiveToolLike | null,
    private getSession: () => DocumentSession | null,
  ) {}

  /**
   * The session's tool state. Real sessions own one from construction (see
   * SessionToolState for why it must not be created lazily by a reader); the
   * lazy fallback only serves minimal session stand-ins.
   */
  stateOf(session: DocumentSession): SessionToolState {
    if (session.toolState) return session.toolState
    let s = this.states.get(session)
    if (!s) {
      s = new SessionToolState()
      this.states.set(session, s)
    }
    return s
  }

  /** Brings `handler` in line with the active tool and session. */
  sync(): void {
    const active = this.getActive()
    const session = this.getSession()
    const instanceId = active?.instance.instanceId
    if (this.key && this.key.instanceId === instanceId && this.key.session === session) return
    untrack(() => {
      this.deactivate()
      if (!active || !session || !instanceId) return
      this.key = { instanceId, session }
      this.handler = active.def.createHandler(this.contextFor(session), this.settingsGetter(active.instance))
    })
  }

  /** Keeps `handler` in sync reactively until the returned stop function is called. */
  start(): () => void {
    this.sync()
    const stop = $effect.root(() => {
      $effect(() => this.sync())
      $effect(() => this.pruneSelection())
    })
    return () => {
      stop()
      untrack(() => this.deactivate())
    }
  }

  /** Drops selected ids whose annotation is gone (undo, redo, eraser, delete). */
  private pruneSelection(): void {
    const session = this.getSession()
    if (!session) return
    const state = this.stateOf(session)
    const alive = state.selection.filter((id) => session.store.get(id) !== undefined)
    if (alive.length !== state.selection.length) state.selection = alive
  }

  private deactivate(): void {
    const old = this.handler
    const oldSession = this.key?.session
    this.handler = null
    this.key = null
    if (old) {
      try {
        old.onDeactivate?.()
      } catch (e) {
        console.error('Tool deactivation failed', e)
      }
    }
    // An uncommitted preview must not outlive its tool.
    if (oldSession) {
      const state = this.stateOf(oldSession)
      state.preview = null
      state.hidden = new Set()
      state.cursor = null
      state.textEdit = null
    }
  }

  private settingsGetter(instance: ToolInstance): () => unknown {
    const id = instance.instanceId
    let last = instance.settings
    return () => {
      const a = this.getActive()
      if (a && a.instance.instanceId === id) last = a.instance.settings
      return last
    }
  }

  private contextFor(session: DocumentSession): ToolContext {
    const state = this.stateOf(session)
    return {
      session,
      execute: (c) => session.history.execute(c),
      selection: {
        get ids() {
          return state.selection
        },
        set: (ids) => {
          state.selection = ids
        },
      },
      preview: {
        set: (a) => {
          state.preview = a
        },
      },
      hidden: {
        get ids() {
          return state.hidden
        },
        set: (ids) => {
          state.hidden = new Set(ids)
        },
      },
      cursor: {
        set: (c) => {
          state.cursor = c
        },
      },
      textEdit: {
        set: (e) => {
          state.textEdit = e
        },
      },
    }
  }
}
