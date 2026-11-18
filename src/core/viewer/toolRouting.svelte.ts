import { untrack } from 'svelte'
import type { ToolContext, ToolDefinition, ToolHandler } from '../registry/tools'
import type { Annotation } from '../session/model'
import type { DocumentSession } from '../session/session.svelte'
import type { ToolInstance } from '../settings/settings.svelte'

interface ActiveToolLike {
  def: ToolDefinition
  instance: ToolInstance
}

/** Per-session tool state: selection and the live (uncommitted) preview annotation. */
export class SessionToolState {
  selection = $state<string[]>([])
  preview = $state.raw<Annotation | null>(null)
  hidden = $state.raw<ReadonlySet<string>>(new Set())
  cursor = $state<string | null>(null)
}

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

  stateOf(session: DocumentSession): SessionToolState {
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
    })
    return () => {
      stop()
      untrack(() => this.deactivate())
    }
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
    }
  }
}
