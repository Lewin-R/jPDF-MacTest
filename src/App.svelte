<script lang="ts">
  import { onMount } from 'svelte'
  import { initFileOpening, pickAndOpen } from './app/fileOpening'
  import { guardPageZoom } from './app/pageZoomGuard'
  import ConfirmClose from './app/ConfirmClose.svelte'
  import { confirmCloseAll, registerSaveCommands } from './app/saveFlow'
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
  import { fullscreen, registerFullscreenCommands } from './app/fullscreen.svelte'
  import Toolbar from './toolbar/Toolbar.svelte'
  import { activeTool } from './toolbar/activeTool.svelte'
  import { registerToolShortcuts } from './toolbar/toolShortcuts'
  import { editSelected, registerSelectionCommands } from './tools/select/commands'
  import { createEraserHandler } from './tools/eraser'
  import type { Annotation } from './core/session/model'
  import Toast from './ui/Toast.svelte'
  import ContextMenu from './ui/ContextMenu.svelte'
  import { rightClickErases } from './tools/rightClick'
  import { pageMenuItems } from './app/pageMenu'

  // Hold the right mouse button to erase with the drawing tools; the others
  // (select, hand, text-selection marker) open the page menu on right-click.
  const router = new ToolRouter(() => activeTool.current, () => tabs.active, {
    create: createEraserHandler,
    enabledFor: (a) => rightClickErases(a?.def.type, a?.instance.settings),
  })

  /** Open page context menu: position (client) and 1-based page number. */
  let pageMenu = $state<{ x: number; y: number; page: number } | null>(null)
  function openPageMenu(page: number, x: number, y: number) {
    pageMenu = { x, y, page: page + 1 }
  }
  /** The toolbar shows once the persisted layout is loaded (no flash of defaults). */
  let settingsLoaded = $state(false)

  /** The selected annotation of the active tab (edited through the select tool's flyout). */
  const selectedAnnotation = $derived.by(() => {
    const s = tabs.active
    const id = s ? router.stateOf(s).selection[0] : undefined
    return (s && id !== undefined && s.store.get(id)) || null
  })

  function editSelection(after: Annotation) {
    if (tabs.active) void editSelected(tabs.active, after)
  }

  function closeActive() {
    if (tabs.activeId) return tabs.close(tabs.activeId)
  }

  $effect(() => {
    const title = tabs.active ? `${tabs.active.fileName} — JuliePDF` : 'JuliePDF'
    getCurrentWindow().setTitle(title).catch(console.error)
  })

  function onKeydown(e: KeyboardEvent) {
    if (keybindings.handle(e)) e.preventDefault()
  }

  /** Window close: Save / Don't save / Cancel for each dirty tab, then flush settings. */
  function guardWindowClose(): () => void {
    const win = getCurrentWindow()
    let closing = false
    let disposed = false
    let unlisten: (() => void) | null = null
    void win
      .onCloseRequested(async (e) => {
        e.preventDefault()
        if (closing) return
        closing = true
        try {
          if (!(await confirmCloseAll(tabs.sessions))) return
          await settings.flush()
          await win.destroy()
        } finally {
          closing = false
        }
      })
      .then((un) => (disposed ? un() : (unlisten = un)))
    return () => {
      disposed = true
      unlisten?.()
    }
  }

  onMount(() => {
    void settings.load().finally(() => (settingsLoaded = true))
    const disposeCloseGuard = guardWindowClose()
    const stopRouter = router.start()
    // Tool modules register at import time (before App mounts).
    const disposeToolShortcuts = registerToolShortcuts()
    const disposePageZoomGuard = guardPageZoom(window)
    const disposeOpening = initFileOpening(async (path) => {
      const existing = tabs.findByPath(path)
      if (existing) tabs.activeId = existing.id
      else tabs.add(await DocumentSession.open(path))
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
    const disposeSave = registerSaveCommands(() => tabs.active)
    const disposeSelection = registerSelectionCommands(() =>
      tabs.active ? { session: tabs.active, state: router.stateOf(tabs.active) } : null,
    )
    // After the selection commands: Escape deselects before it leaves fullscreen.
    const disposeFullscreen = registerFullscreenCommands()
    fullscreen.anchor = () => tabs.active?.anchorView() ?? null
    const stopFullscreenSync = fullscreen.start()
    return () => {
      stopFullscreenSync()
      fullscreen.anchor = null
      disposeFullscreen()
      disposeSelection()
      disposeSave()
      disposeCloseGuard()
      disposeToolShortcuts()
      stopRouter()
      disposeEdit()
      disposeView()
      disposeTabs.forEach((d) => d())
      disposeKey()
      disposeCommand()
      disposeOpening()
      disposePageZoomGuard()
    }
  })
</script>

<svelte:window onkeydown={onKeydown} />

<div class="shell" class:fullscreen={fullscreen.active}>
  <div class="titlebar-region"><TitleBar /></div>
  <main class="viewer-region">
    {#if tabs.active}
      {#key tabs.active.id}
        <Viewer
          session={tabs.active}
          tool={router.handler}
          eraser={router.eraser}
          cursor={router.cursor}
          toolPreview={router.stateOf(tabs.active).preview}
          toolHidden={router.stateOf(tabs.active).hidden}
          toolTextEdit={router.stateOf(tabs.active).textEdit}
          toolSelection={router.stateOf(tabs.active).selection}
          onpagemenu={openPageMenu}
        />
      {/key}
    {:else}
      <EmptyState onOpen={pickAndOpen} />
    {/if}
  </main>
  <aside class="toolbar-region">
    {#if settingsLoaded}<Toolbar selected={selectedAnnotation} onEditSelected={editSelection} />{/if}
  </aside>
  <div class="statusbar-region"><StatusBar session={tabs.active} /></div>
</div>
<ConfirmClose />
<Toast />
{#if pageMenu && tabs.active}
  <ContextMenu
    x={pageMenu.x}
    y={pageMenu.y}
    items={pageMenuItems(pageMenu.page, tabs.active)}
    onclose={() => (pageMenu = null)}
  />
{/if}

<style>
  .shell {
    display: grid;
    grid-template-rows: var(--titlebar-h) 1fr var(--statusbar-h);
    grid-template-columns: 1fr var(--toolstrip-w);
    height: 100vh;
    background: var(--bg);
  }
  /* Fullscreen: only the viewer remains (the chrome stays mounted, just hidden). */
  .shell.fullscreen {
    grid-template-rows: 1fr;
    grid-template-columns: 1fr;
  }
  .shell.fullscreen .titlebar-region,
  .shell.fullscreen .toolbar-region,
  .shell.fullscreen .statusbar-region {
    display: none;
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
