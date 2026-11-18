<script lang="ts">
  import Plus from '@lucide/svelte/icons/plus'
  import X from '@lucide/svelte/icons/x'
  import { commands } from '../core/registry/commands'
  import { tabs } from './tabs.svelte'
</script>

<div class="tabs" role="tablist">
  {#each tabs.sessions as s (s.id)}
    <div
      class="tab"
      class:active={s.id === tabs.activeId}
      role="tab"
      tabindex="0"
      aria-selected={s.id === tabs.activeId}
      title={s.path}
      onclick={() => (tabs.activeId = s.id)}
      onkeydown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') tabs.activeId = s.id
      }}
      onauxclick={(e) => {
        if (e.button === 1) void tabs.close(s.id)
      }}
    >
      <span class="name">{s.fileName}</span>
      <button
        type="button"
        class="close"
        aria-label="Close {s.fileName}"
        onclick={(e) => {
          e.stopPropagation()
          void tabs.close(s.id)
        }}
      >
        {#if s.dirty}
          <span class="dot">•</span>
          <span class="x"><X size={14} /></span>
        {:else}
          <span class="x always"><X size={14} /></span>
        {/if}
      </button>
    </div>
  {/each}
  <button
    type="button"
    class="add"
    aria-label="Open PDF"
    onclick={() => void commands.execute('file.open')}
  >
    <Plus size={16} />
  </button>
</div>

<style>
  .tabs {
    display: flex;
    align-items: stretch;
    height: 100%;
    min-width: 0;
  }
  .tab {
    display: flex;
    align-items: center;
    gap: 8px;
    max-width: 200px;
    padding: 0 8px 0 12px;
    color: var(--text);
    cursor: default;
    transition: background var(--transition);
  }
  .tab:hover {
    background: var(--surface-hover);
  }
  .tab.active {
    background: var(--surface);
    color: var(--text-strong);
  }
  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .close,
  .add {
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: 0;
    color: inherit;
    border-radius: var(--radius-sm);
    cursor: pointer;
  }
  .close {
    flex: none;
    width: 20px;
    height: 20px;
    padding: 0;
  }
  .close:hover,
  .add:hover {
    background: var(--surface-hover);
  }
  .x {
    display: none;
  }
  .x.always {
    display: flex;
    visibility: hidden;
  }
  .tab:hover .x,
  .close:focus-visible .x {
    display: flex;
    visibility: visible;
  }
  .tab:hover .dot,
  .close:focus-visible .dot {
    display: none;
  }
  .add {
    align-self: center;
    width: 28px;
    height: 28px;
    margin: 0 4px;
    color: var(--text);
  }
</style>
