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
  import Viewer from './core/viewer/Viewer.svelte'
  import { registerEditCommands } from './core/session/editCommands'
  import { registerViewCommands } from './core/viewer/viewCommands'
  import { ToolRouter } from './core/viewer/toolRouting.svelte'
  import { settings } from './core/settings/settings.svelte'
  import { openErrorMessage } from './app/openErrors'
  import Toolbar from './toolbar/Toolbar.svelte'
  import { activeTool } from './toolbar/activeTool.svelte'
  import { registerToolShortcuts } from './toolbar/toolShortcuts'
  import Toast from './ui/Toast.svelte'
  import { toasts } from './ui/toasts.svelte'

  const router = new ToolRouter(() => activeTool.current, () => tabs.active)
  /** The toolbar shows once the persisted layout is loaded (no flash of defaults). */
  let settingsLoaded = $state(false)

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
    void settings.load().finally(() => (settingsLoaded = true))
    const stopRouter = router.start()
    // Tool modules register at import time (before App mounts).
    const disposeToolShortcuts = registerToolShortcuts()
    const disposeOpening = initFileOpening(async (path) => {
      try {
        const existing = tabs.findByPath(path)
        if (existing) tabs.activeId = existing.id
        else tabs.add(await DocumentSession.open(path))
      } catch (e) {
        toasts.show(openErrorMessage(e, path), 'error')
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
    const disposeView = registerViewCommands(() => tabs.active)
    const disposeEdit = registerEditCommands(() => tabs.active)
    return () => {
      disposeToolShortcuts()
      stopRouter()
      disposeEdit()
      disposeView()
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
      {#key tabs.active.id}
        <Viewer
          session={tabs.active}
          tool={router.handler}
          cursor={router.cursor}
          toolPreview={router.stateOf(tabs.active).preview}
          toolHidden={router.stateOf(tabs.active).hidden}
        />
      {/key}
    {:else}
      <EmptyState onOpen={pickAndOpen} />
    {/if}
  </main>
  <aside class="toolbar-region">
    {#if settingsLoaded}<Toolbar />{/if}
  </aside>
  <div class="statusbar-region"><StatusBar session={tabs.active} /></div>
</div>
<Toast />

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
    overflow: hidden;
  }
  .toolbar-region {
    min-height: 0;
    background: var(--bg-deep);
    border-left: 1px solid var(--border);
  }
  .statusbar-region {
    grid-column: 1 / -1;
  }
</style>
