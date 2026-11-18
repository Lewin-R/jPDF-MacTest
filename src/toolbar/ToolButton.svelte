<script lang="ts">
  import type { ToolDefinition } from '../core/registry/tools'
  import type { ToolInstance } from '../core/settings/settings.svelte'

  let {
    def,
    instance,
    active,
    dragOffset = null,
    onclick,
    oncontextmenu,
    onpointerdown,
    onpointermove,
    onpointerup,
  }: {
    def: ToolDefinition
    instance: ToolInstance
    active: boolean
    /** Vertical drag offset (px) while this button is being dragged. */
    dragOffset?: number | null
    onclick(e: MouseEvent): void
    oncontextmenu(e: MouseEvent): void
    onpointerdown(e: PointerEvent): void
    onpointermove(e: PointerEvent): void
    onpointerup(e: PointerEvent): void
  } = $props()

  const title = $derived(def.shortcut ? `${def.displayName} (${def.shortcut.toUpperCase()})` : def.displayName)
</script>

<button
  type="button"
  class="tool"
  class:active
  class:dragging={dragOffset !== null}
  style:transform={dragOffset !== null ? `translateY(${dragOffset}px)` : undefined}
  data-instance={instance.instanceId}
  aria-label={def.displayName}
  aria-pressed={active}
  {title}
  {onclick}
  {oncontextmenu}
  {onpointerdown}
  {onpointermove}
  {onpointerup}
  onpointercancel={onpointerup}
>
  <def.Icon settings={instance.settings} size={20} />
</button>

<style>
  .tool {
    position: relative;
    display: grid;
    place-items: center;
    flex: none;
    width: 40px;
    height: 40px;
    padding: 0;
    border: none;
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--text);
    cursor: pointer;
    touch-action: none;
    transition: background var(--transition), color var(--transition);
  }
  .tool:hover {
    background: var(--surface-hover);
    color: var(--text-strong);
  }
  .tool.active {
    background: var(--accent-soft);
    color: var(--text-strong);
  }
  /* 2px accent bar at the strip's left edge (button sits 6px in). */
  .tool::before {
    content: '';
    position: absolute;
    left: -6px;
    top: 10px;
    bottom: 10px;
    width: 2px;
    border-radius: 1px;
    background: var(--accent);
    opacity: 0;
    transform: scaleY(0.4);
    transition: opacity var(--transition), transform var(--transition);
  }
  .tool.active::before {
    opacity: 1;
    transform: none;
  }
  .tool.dragging {
    z-index: 1;
    background: var(--surface);
    box-shadow: var(--shadow-soft);
    cursor: grabbing;
    transition: none;
  }
  .tool.dragging::before {
    opacity: 0;
  }
</style>
