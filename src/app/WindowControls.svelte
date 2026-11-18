<script lang="ts">
  import { getCurrentWindow } from '@tauri-apps/api/window'
  import Minus from '@lucide/svelte/icons/minus'
  import Square from '@lucide/svelte/icons/square'
  import X from '@lucide/svelte/icons/x'

  const win = getCurrentWindow()
</script>

<div class="controls">
  <button type="button" aria-label="Minimize" onclick={() => win.minimize()}>
    <Minus size={16} />
  </button>
  <button type="button" aria-label="Maximize" onclick={() => win.toggleMaximize()}>
    <Square size={14} />
  </button>
  <button type="button" class="close" aria-label="Close" onclick={() => win.close()}>
    <X size={16} />
  </button>
</div>

<style>
  .controls {
    display: flex;
    height: 100%;
  }
  button {
    width: 46px;
    height: 100%;
    display: grid;
    place-items: center;
    background: transparent;
    border: 0;
    color: var(--text);
    cursor: default;
    transition: background var(--transition), color var(--transition);
  }
  button:hover {
    background: var(--surface-hover);
    color: var(--text-strong);
  }
  button.close:hover {
    background: var(--danger);
    color: var(--text-strong);
  }
</style>
