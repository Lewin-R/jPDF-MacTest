<script lang="ts">
  import { actionIcons } from '../../ui/actionIcons'
  import type { PageViewport } from 'pdfjs-dist'
  import { commands as defaultCommands, type CommandRegistry } from '../registry/commands'
  import type { Rect } from '../session/model'

  let {
    rect,
    vp,
    count,
    commands = defaultCommands,
  }: {
    /** The selection's box on the page (viewport px). */
    rect: Rect
    vp: PageViewport
    /** Number of selected annotations. */
    count: number
    commands?: CommandRegistry
  } = $props()

  /** Approximate bar size (px), to keep it on the page. */
  const BAR_W = 168
  const BAR_H = 34
  const GAP = 8

  // Above the selection; below it when there is no room above.
  const top = $derived(rect[1] - BAR_H - GAP >= 0 ? rect[1] - BAR_H - GAP : Math.min(rect[3] + GAP, vp.height - BAR_H))
  const left = $derived(Math.max(0, Math.min(rect[0], vp.width - BAR_W)))

  const actions = [
    { id: 'edit.duplicate', label: 'Duplicate (Ctrl+D)', Icon: actionIcons.duplicate, danger: false },
    { id: 'edit.flatten', label: 'Flatten into the page (permanent once saved)', Icon: actionIcons.flatten, danger: false },
    { id: 'edit.delete', label: 'Delete (Del)', Icon: actionIcons.delete, danger: true },
  ]

  function run(e: MouseEvent, id: string) {
    e.stopPropagation()
    void commands.execute(id)
  }
</script>

<!-- A sibling of the overlay: its presses never reach the tool or the text layer. -->
<div
  class="selection-bar"
  role="toolbar"
  aria-label="Selection actions"
  tabindex="-1"
  style:left="{left}px"
  style:top="{top}px"
  onpointerdown={(e) => e.stopPropagation()}
>
  <span class="count">{count} selected</span>
  {#each actions as a (a.id)}
    <button type="button" class:danger={a.danger} title={a.label} aria-label={a.label} onclick={(e) => run(e, a.id)}>
      <a.Icon size={16} />
    </button>
  {/each}
</div>

<style>
  .selection-bar {
    position: absolute;
    z-index: 2;
    display: flex;
    align-items: center;
    gap: 2px;
    height: 34px;
    padding: 0 4px 0 10px;
    box-sizing: border-box;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-soft);
    font: var(--font-size-base) var(--font-ui);
    color: var(--text);
    white-space: nowrap;
    user-select: none;
  }
  .count {
    margin-right: 6px;
  }
  button {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: none;
    border-radius: var(--radius-sm);
    background: none;
    color: var(--text-strong);
    cursor: pointer;
    transition: background var(--transition);
  }
  button:hover {
    background: var(--surface-hover);
  }
  button:focus-visible {
    outline: 1px solid var(--accent);
  }
  button.danger:hover {
    color: var(--danger);
  }
</style>
