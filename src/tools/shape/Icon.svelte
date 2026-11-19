<script lang="ts">
  import Shapes from '@lucide/svelte/icons/shapes'
  import type { RGB } from '../../core/session/model'
  import { rgbToHex } from '../../ui/color'
  import type { ShapeStyle } from './settings'

  let { settings, size }: { settings: ShapeStyle; size: number } = $props()

  // Tinted with the border colour, or the fill colour of a shape without border.
  const color: RGB = $derived(settings.border?.color ?? settings.fill?.color ?? [0, 0, 0])
  const hex = $derived(rgbToHex(color))
  // Very dark colours vanish on the dark toolbar strip: add a light halo.
  const dark = $derived(0.2126 * color[0] + 0.7152 * color[1] + 0.0722 * color[2] < 0.2)
</script>

<span class="shape" class:dark style:color={hex}>
  <Shapes {size} />
</span>

<style>
  .shape {
    display: inline-grid;
    place-items: center;
  }
  .dark {
    filter: drop-shadow(0 0 1px var(--icon-halo)) drop-shadow(0 0 1px var(--icon-halo));
  }
</style>
