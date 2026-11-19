<script lang="ts">
  import TextControls from './TextControls.svelte'
  import type { TextSettings } from './settings'

  let { settings, update }: { settings: TextSettings; update(patch: Partial<TextSettings>): void } = $props()
</script>

<div class="options">
  <TextControls value={{ ...settings, align: settings.align ?? 'left' }} onchange={update} oncommit={update} />
</div>

<style>
  .options {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
</style>
