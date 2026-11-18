import { commands as defaultCommands, type CommandRegistry } from '../core/registry/commands'
import { keybindings as defaultKeybindings, type KeybindingRegistry } from '../core/registry/keybindings'
import { toolRegistry, type ToolRegistry } from '../core/registry/tools'
import { settings as defaultSettings, type SettingsStore, type ToolInstance } from '../core/settings/settings.svelte'

/**
 * Instance a tool's letter shortcut selects: the first instance of `type`, or,
 * when an instance of `type` is already active, the next one (wrapping).
 */
export function nextInstanceOfType(toolbar: ToolInstance[], activeId: string | null, type: string): string | null {
  const ofType = toolbar.filter((i) => i.type === type)
  if (ofType.length === 0) return null
  const i = ofType.findIndex((t) => t.instanceId === activeId)
  return ofType[(i + 1) % ofType.length].instanceId
}

/**
 * Registers a `tool.<type>` command bound to the upper-case `shortcut` letter
 * for every registered tool that has one. Tools register at import time, so
 * call this once after all tool modules are imported (App does it on mount);
 * tools registered later need another call. Returns a disposer.
 */
export function registerToolShortcuts(
  registry: ToolRegistry = toolRegistry,
  store: SettingsStore = defaultSettings,
  cmds: CommandRegistry = defaultCommands,
  keys: KeybindingRegistry = defaultKeybindings,
): () => void {
  const disposers = registry.list().flatMap((def) => {
    if (!def.shortcut) return []
    const id = `tool.${def.type}`
    const target = () => nextInstanceOfType(store.data.toolbar, store.data.activeInstanceId, def.type)
    return [
      cmds.register({
        id,
        title: `Select ${def.displayName}`,
        enabled: () => target() !== null,
        run: () => {
          const next = target()
          if (next) store.setActive(next)
        },
      }),
      keys.bind(def.shortcut.toUpperCase(), id),
    ]
  })
  return () => disposers.forEach((d) => d())
}
