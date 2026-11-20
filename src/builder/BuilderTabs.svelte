<script lang="ts">
  export type BuilderView = 'pages' | 'merge'

  let { view, onchange }: { view: BuilderView; onchange: (view: BuilderView) => void } = $props()

  const VIEWS: { id: BuilderView; label: string }[] = [
    { id: 'pages', label: 'Pages' },
    { id: 'merge', label: 'Merge' },
  ]
</script>

<div class="tabs" role="tablist" aria-label="Document Builder">
  {#each VIEWS as v (v.id)}
    <button
      type="button"
      role="tab"
      aria-selected={view === v.id}
      class:active={view === v.id}
      onclick={() => view !== v.id && onchange(v.id)}
    >
      {v.label}
    </button>
  {/each}
</div>

<style>
  .tabs {
    display: inline-flex;
    flex: none;
    gap: 2px;
    padding: 2px;
    background: var(--bg-deep);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
  }
  button {
    height: 24px;
    padding: 0 12px;
    background: transparent;
    border: 0;
    border-radius: var(--radius-sm);
    color: var(--text);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
    transition: background var(--transition), color var(--transition);
  }
  button:hover:not(.active) {
    background: var(--surface-hover);
    color: var(--text-strong);
  }
  .active {
    background: var(--accent-soft);
    color: var(--text-strong);
    cursor: default;
  }
</style>
