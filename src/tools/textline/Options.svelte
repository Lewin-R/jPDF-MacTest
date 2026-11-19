<script lang="ts">
  import TextLineControls from './TextLineControls.svelte'
  import type { TextLineSettings } from './settings'

  let { settings, update }: { settings: TextLineSettings; update(patch: Partial<TextLineSettings>): void } =
    $props()
</script>

<TextLineControls value={settings} onchange={update} oncommit={update} />
