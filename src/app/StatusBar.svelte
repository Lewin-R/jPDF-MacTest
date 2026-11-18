<script lang="ts">
  import Maximize from 'lucide-svelte/icons/maximize'
  import Redo2 from 'lucide-svelte/icons/redo-2'
  import Undo2 from 'lucide-svelte/icons/undo-2'

  let { hasDocument = false }: { hasDocument?: boolean } = $props()
</script>

<footer class="statusbar">
  <div class="left">
    <button type="button" aria-label="Undo" disabled={!hasDocument}><Undo2 size={16} /></button>
    <button type="button" aria-label="Redo" disabled={!hasDocument}><Redo2 size={16} /></button>
  </div>
  <div class="center" data-region="page-nav"></div>
  <div class="right">
    <div data-region="zoom"></div>
    <button type="button" aria-label="Fullscreen" disabled={!hasDocument}>
      <Maximize size={16} />
    </button>
  </div>
</footer>

<style>
  .statusbar {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    height: 100%;
    padding: 0 8px;
    background: var(--bg-deep);
    border-top: 1px solid var(--border);
  }
  .left,
  .right {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .right {
    justify-content: flex-end;
  }
  button {
    display: grid;
    place-items: center;
    width: 28px;
    height: 24px;
    background: transparent;
    border: 0;
    border-radius: var(--radius-sm);
    color: var(--text);
    cursor: pointer;
    transition: background var(--transition);
  }
  button:hover:not(:disabled) {
    background: var(--surface-hover);
  }
  button:disabled {
    color: var(--text-muted);
    cursor: default;
  }
</style>
