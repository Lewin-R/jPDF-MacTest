<script lang="ts">
  import { onMount } from 'svelte'
  import { initFileOpening, pickAndOpen } from './app/fileOpening'
  import { commands } from './core/registry/commands'
  import { openPdf } from './core/ipc/api'
  import EmptyState from './app/EmptyState.svelte'
  import StatusBar from './app/StatusBar.svelte'
  import TitleBar from './app/TitleBar.svelte'
  import { keybindings } from './core/registry/keybindings'

  function onKeydown(e: KeyboardEvent) {
    if (keybindings.handle(e)) e.preventDefault()
  }

  onMount(() => {
    // Temporary open handler until the viewer exists.
    const disposeOpening = initFileOpening(async (path) => {
      const bytes = await openPdf(path)
      console.log(path, bytes.byteLength)
    })
    const disposeCommand = commands.register({
      id: 'file.open',
      title: 'Open PDF…',
      run: pickAndOpen,
    })
    const disposeKey = keybindings.bind('Ctrl+O', 'file.open')
    return () => {
      disposeKey()
      disposeCommand()
      disposeOpening()
    }
  })
</script>

<svelte:window onkeydown={onKeydown} />

<div class="shell">
  <div class="titlebar-region"><TitleBar /></div>
  <main class="viewer-region"><EmptyState onOpen={pickAndOpen} /></main>
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
