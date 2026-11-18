<script lang="ts">
  import EmptyState from './app/EmptyState.svelte'
  import StatusBar from './app/StatusBar.svelte'
  import TitleBar from './app/TitleBar.svelte'
  import { keybindings } from './core/registry/keybindings'

  function onKeydown(e: KeyboardEvent) {
    if (keybindings.handle(e)) e.preventDefault()
  }

  function openPdf() {
    // Wired in a later task.
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div class="shell">
  <div class="titlebar-region"><TitleBar /></div>
  <main class="viewer-region"><EmptyState onOpen={openPdf} /></main>
  <aside class="toolbar-region" aria-label="Tools"></aside>
  <div class="statusbar-region"><StatusBar /></div>
</div>

<style>
  .shell {
    display: grid;
    grid-template-rows: var(--titlebar-h) 1fr var(--statusbar-h);
    grid-template-columns: 1fr var(--toolstrip-w);
    height: 100vh;
    background: var(--bg);
  }
  .titlebar-region {
    grid-column: 1 / -1;
  }
  .viewer-region {
    min-width: 0;
    min-height: 0;
    overflow: auto;
  }
  .toolbar-region {
    background: var(--bg-deep);
    border-left: 1px solid var(--border);
  }
  .statusbar-region {
    grid-column: 1 / -1;
  }
</style>
