import { toolRegistry, type ToolDefinition, type ToolRegistry } from '../core/registry/tools'
import { settings, type SettingsStore, type ToolInstance } from '../core/settings/settings.svelte'

export interface ActiveToolValue {
  def: ToolDefinition
  instance: ToolInstance
}

/** Finds a registered definition without throwing (the registry itself is not reactive). */
export function findTool(registry: ToolRegistry, type: string): ToolDefinition | undefined {
  return registry.list().find((d) => d.type === type)
}

/**
 * The active tool instance paired with its definition; null when nothing is
 * active or the active instance's type is not registered.
 */
export class ActiveTool {
  readonly current: ActiveToolValue | null = $derived.by(() => {
    const { toolbar, activeInstanceId } = this.store.data
    const instance = toolbar.find((i) => i.instanceId === activeInstanceId)
    const def = instance && findTool(this.registry, instance.type)
    return instance && def ? { def, instance } : null
  })

  constructor(
    private store: SettingsStore = settings,
    private registry: ToolRegistry = toolRegistry,
  ) {}
}

export const activeTool = new ActiveTool()
