<script lang="ts">
  import Type from '@lucide/svelte/icons/type'
  import type { RGB } from '../../core/session/model'
  import { rgbToHex } from '../../ui/color'

  let { settings, size }: { settings: { textColor: RGB }; size: number } = $props()

  const hex = $derived(rgbToHex(settings.textColor))
  // Very dark colours vanish on the dark toolbar strip: add a light halo.
  const dark = $derived(
    0.2126 * settings.textColor[0] + 0.7152 * settings.textColor[1] + 0.0722 * settings.textColor[2] < 0.2,
  )
</script>

<span class="text" class:dark style:color={hex}>
  <Type {size} />
</span>

<style>
  .text {
    display: inline-grid;
    place-items: center;
  }
  .dark {
    filter: drop-shadow(0 0 1px var(--icon-halo)) drop-shadow(0 0 1px var(--icon-halo));
  }
</style>
