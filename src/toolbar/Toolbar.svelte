<script lang="ts">
  import Copy from '@lucide/svelte/icons/copy'
  import Plus from '@lucide/svelte/icons/plus'
  import SlidersHorizontal from '@lucide/svelte/icons/sliders-horizontal'
  import Trash2 from '@lucide/svelte/icons/trash-2'
  import { toolRegistry, type ToolRegistry } from '../core/registry/tools'
  import type { Annotation } from '../core/session/model'
  import { settings, type SettingsStore } from '../core/settings/settings.svelte'
  import ContextMenu, { type MenuItem } from '../ui/ContextMenu.svelte'
  import Flyout from '../ui/Flyout.svelte'
  import { findTool } from './activeTool.svelte'
  import { DRAG_THRESHOLD, insertionIndex, reorderTarget } from './reorder'
  import ToolButton from './ToolButton.svelte'
  import ToolPicker from './ToolPicker.svelte'

  let {
    registry = toolRegistry,
    store = settings,
    selected = null,
    onEditSelected = () => {},
  }: {
    registry?: ToolRegistry
    store?: SettingsStore
    /** The selected annotation: tools with SelectionOptions show those in their flyout instead of Options. */
    selected?: Annotation | null
    /** Commits an edit of `selected` (one undo step). */
    onEditSelected?(after: Annotation): void
  } = $props()

  // Instances of unregistered tool types stay in the settings but are not shown.
  const visible = $derived(
    store.data.toolbar.flatMap((instance) => {
      const def = findTool(registry, instance.type)
      return def ? [{ instance, def }] : []
    }),
  )

  let flyout = $state<{ id: string; anchor: HTMLElement } | null>(null)
  let menu = $state<{ id: string; anchor: HTMLElement; x: number; y: number } | null>(null)
  let pickerOpen = $state(false)

  const flyoutEntry = $derived(flyout && visible.find((v) => v.instance.instanceId === flyout!.id))
  const menuEntry = $derived(menu && visible.find((v) => v.instance.instanceId === menu!.id))

  let list: HTMLDivElement
  let drag = $state<{
    id: string
    pointerId: number
    startX: number
    startY: number
    dy: number
    active: boolean
    slot: number
  } | null>(null)
  let indicatorTop = $state<number | null>(null)
  /** Set when a drag ends, so the click that follows pointerup is ignored. */
  let suppressClick = false

  function buttons(): HTMLElement[] {
    return [...list.querySelectorAll<HTMLElement>('[data-instance]')]
  }

  function onClick(id: string, e: MouseEvent) {
    if (suppressClick) {
      suppressClick = false
      return
    }
    if (store.data.activeInstanceId === id) {
      flyout = flyout?.id === id ? null : { id, anchor: e.currentTarget as HTMLElement }
    } else {
      store.setActive(id)
      flyout = null
    }
  }

  function onContextMenu(id: string, e: MouseEvent) {
    e.preventDefault()
    flyout = null
    menu = { id, anchor: e.currentTarget as HTMLElement, x: e.clientX, y: e.clientY }
  }

  function menuItems(id: string, allowDuplicate: boolean, anchor: HTMLElement): MenuItem[] {
    const items: MenuItem[] = [{ label: 'Options', icon: SlidersHorizontal, run: () => (flyout = { id, anchor }) }]
    if (allowDuplicate) items.push({ label: 'Duplicate', icon: Copy, run: () => store.duplicate(id) })
    items.push({
      label: 'Remove',
      icon: Trash2,
      danger: true,
      run: () => {
        if (flyout?.id === id) flyout = null
        store.remove(id)
      },
    })
    return items
  }

  function onPointerDown(id: string, e: PointerEvent) {
    suppressClick = false
    if (e.button !== 0) return
    drag = { id, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, dy: 0, active: false, slot: 0 }
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
  }

  function onPointerMove(e: PointerEvent) {
    if (!drag || drag.pointerId !== e.pointerId) return
    const dy = e.clientY - drag.startY
    if (!drag.active) {
      if (Math.hypot(e.clientX - drag.startX, dy) <= DRAG_THRESHOLD) return
      drag.active = true
      flyout = null
      menu = null
    }
    drag.dy = dy
    const els = buttons()
    const rects = els.map((b) => b.getBoundingClientRect())
    const from = els.findIndex((b) => b.dataset.instance === drag!.id)
    // Centres as laid out (the dragged button's transform must not count).
    const centres = rects.map((r, i) => (r.top + r.bottom) / 2 - (i === from ? dy : 0))
    drag.slot = insertionIndex(centres, from, e.clientY)
    const others = rects.filter((_, i) => i !== from)
    const listTop = list.getBoundingClientRect().top - list.scrollTop
    const y = drag.slot < others.length ? others[drag.slot].top - 4 : (others.at(-1)?.bottom ?? 0) + 4
    indicatorTop = y - listTop
  }

  function onPointerUp(e: PointerEvent) {
    if (!drag || drag.pointerId !== e.pointerId) return
    const d = drag
    drag = null
    indicatorTop = null
    if (!d.active) return
    suppressClick = true
    const to = reorderTarget(
      store.data.toolbar.map((i) => i.instanceId),
      visible.map((v) => v.instance.instanceId),
      d.id,
      d.slot,
    )
    if (to !== null) store.move(d.id, to)
  }

  /** A cancelled press or drag (system gesture, lost pointer) aborts without reordering. */
  function onPointerCancel(e: PointerEvent) {
    if (!drag || drag.pointerId !== e.pointerId) return
    drag = null
    indicatorTop = null
  }

  function pick(type: string) {
    const inst = store.addInstance(type)
    store.setActive(inst.instanceId)
    pickerOpen = false
  }
</script>

<div class="toolbar" role="toolbar" aria-orientation="vertical" aria-label="Tools">
  <div class="list" bind:this={list}>
    {#each visible as { instance, def } (instance.instanceId)}
      <ToolButton
        {def}
        {instance}
        active={store.data.activeInstanceId === instance.instanceId}
        dragOffset={drag?.active && drag.id === instance.instanceId ? drag.dy : null}
        onclick={(e) => onClick(instance.instanceId, e)}
        oncontextmenu={(e) => onContextMenu(instance.instanceId, e)}
        onpointerdown={(e) => onPointerDown(instance.instanceId, e)}
        onpointermove={onPointerMove}
        onpointerup={onPointerUp}
        onpointercancel={onPointerCancel}
      />
    {/each}
    {#if indicatorTop !== null}
      <div class="drop-indicator" style:top="{indicatorTop}px"></div>
    {/if}
  </div>
  <div class="divider"></div>
  <button type="button" class="add" aria-label="Add tool" title="Add tool" onclick={() => (pickerOpen = true)}>
    <Plus size={20} />
  </button>
</div>

{#if flyout && flyoutEntry}
  {@const { def, instance } = flyoutEntry}
  <Flyout anchor={flyout.anchor} label="{def.displayName} options" title={def.displayName} onclose={() => (flyout = null)}>
    {#if def.SelectionOptions && selected}
      <def.SelectionOptions annotation={selected} update={onEditSelected} />
    {:else if def.Options}
      <def.Options
        settings={instance.settings}
        update={(patch: object) => store.updateSettings(instance.instanceId, patch)}
      />
    {:else}
      <p class="empty">No options</p>
    {/if}
  </Flyout>
{/if}

{#if menu && menuEntry}
  <ContextMenu
    x={menu.x}
    y={menu.y}
    items={menuItems(menu.id, menuEntry.def.allowMultipleInstances, menu.anchor)}
    onclose={() => (menu = null)}
  />
{/if}

{#if pickerOpen}
  <ToolPicker {registry} {store} onpick={pick} onclose={() => (pickerOpen = false)} />
{/if}

<style>
  .toolbar {
    display: flex;
    flex-direction: column;
    align-items: center;
    height: 100%;
    background: var(--bg-deep);
  }
  .list {
    position: relative;
    flex: 1;
    min-height: 0;
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 8px 0;
    overflow-y: auto;
    overflow-x: hidden;
    scrollbar-width: none;
  }
  /* Vertically centred while it fits; scrolls from the top when it doesn't. */
  .list::before,
  .list::after {
    content: '';
    margin: auto;
  }
  .drop-indicator {
    position: absolute;
    left: 10px;
    right: 10px;
    height: 2px;
    margin-top: -1px;
    border-radius: 1px;
    background: var(--accent);
    pointer-events: none;
  }
  .divider {
    flex: none;
    width: 24px;
    height: 1px;
    background: var(--border);
  }
  .add {
    flex: none;
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    margin: 6px 0 8px;
    padding: 0;
    border: none;
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--text);
    cursor: pointer;
    transition: background var(--transition), color var(--transition);
  }
  .add:hover {
    background: var(--surface-hover);
    color: var(--accent);
  }
  .empty {
    margin: 0;
    color: var(--text-muted);
  }
</style>
