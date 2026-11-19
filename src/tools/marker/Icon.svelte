<script lang="ts">
  import Highlighter from '@lucide/svelte/icons/highlighter'
  import type { RGB } from '../../core/session/model'
  import { rgbToHex } from '../../ui/color'

  let { settings, size }: { settings: { color: RGB }; size: number } = $props()

  const hex = $derived(rgbToHex(settings.color))
</script>

<span class="marker" style:color={hex}>
  <Highlighter {size} />
</span>

<style>
  .marker {
    display: inline-grid;
    place-items: center;
  }
</style>
