<script lang="ts">
  import PenLine from '@lucide/svelte/icons/pen-line'
  import type { RGB } from '../../core/session/model'
  import { rgbToHex } from '../../ui/color'

  let { settings, size }: { settings: { color: RGB }; size: number } = $props()

  const hex = $derived(rgbToHex(settings.color))
  // Very dark colours vanish on the dark toolbar strip: add a light halo.
  const dark = $derived(
    0.2126 * settings.color[0] + 0.7152 * settings.color[1] + 0.0722 * settings.color[2] < 0.2,
  )
</script>

<span class="pen" class:dark style:color={hex}>
  <PenLine {size} />
</span>

<style>
  .pen {
    display: inline-grid;
    place-items: center;
  }
  .dark {
    filter: drop-shadow(0 0 1px var(--icon-halo)) drop-shadow(0 0 1px var(--icon-halo));
  }
</style>
