<script lang="ts">
  import { onMount } from 'svelte'
  import { initFileOpening, pickAndOpen } from './app/fileOpening'
  import { commands } from './core/registry/commands'
  import { getCurrentWindow } from '@tauri-apps/api/window'
  import { DocumentSession } from './core/session/session.svelte'
  import { tabs } from './app/tabs.svelte'
  import EmptyState from './app/EmptyState.svelte'
  import StatusBar from './app/StatusBar.svelte'
  import TitleBar from './app/TitleBar.svelte'
  import { keybindings } from './core/registry/keybindings'

  function closeActive() {
    if (tabs.activeId) return tabs.close(tabs.activeId)
  }

  $effect(() => {
    const title = tabs.active ? `${tabs.active.fileName} — JuliePDF` : 'JuliePDF'
    void getCurrentWindow().setTitle(title)
  })

  function onKeydown(e: KeyboardEvent) {
    if (keybindings.handle(e)) e.preventDefault()
  }

  onMount(() => {
    const disposeOpening = initFileOpening(async (path) => {
      try {
        tabs.add(await DocumentSession.open(path))
      } catch (e) {
        // Toasts arrive in Task 12.
        console.error(`Failed to open ${path}`, e)
      }
    })
    const disposeCommand = commands.register({
      id: 'file.open',
      title: 'Open PDF…',
      run: pickAndOpen,
    })
    const disposeKey = keybindings.bind('Ctrl+O', 'file.open')
    const tabCommands = [
      { id: 'tab.close', title: 'Close tab', chord: 'Ctrl+W', run: () => closeActive() },
      { id: 'tab.next', title: 'Next tab', chord: 'Ctrl+Tab', run: () => tabs.next() },
      { id: 'tab.prev', title: 'Previous tab', chord: 'Ctrl+Shift+Tab', run: () => tabs.prev() },
    ]
    const disposeTabs = tabCommands.flatMap((c) => [
      commands.register({
        id: c.id,
        title: c.title,
        run: c.run,
        enabled: () => tabs.active !== null,
      }),
      keybindings.bind(c.chord, c.id),
    ])
    return () => {
      disposeTabs.forEach((d) => d())
      disposeKey()
      disposeCommand()
      disposeOpening()
    }
  })
</script>

<svelte:window onkeydown={onKeydown} />

<div class="shell">
  <div class="titlebar-region"><TitleBar /></div>
  <main class="viewer-region">
    {#if tabs.active}
      <div class="placeholder">
        {tabs.active.fileName} · {tabs.active.doc.numPages}
        {tabs.active.doc.numPages === 1 ? 'page' : 'pages'}
      </div>
    {:else}
      <EmptyState onOpen={pickAndOpen} />
    {/if}
  </main>
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
  .placeholder {
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text);
  }
  .toolbar-region {
    background: var(--bg-deep);
    border-left: 1px solid var(--border);
  }
  .statusbar-region {
    grid-column: 1 / -1;
  }
</style>
