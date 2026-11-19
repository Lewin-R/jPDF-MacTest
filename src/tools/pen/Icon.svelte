<script lang="ts">
  import { isDark, rgbToHex } from '../../ui/color'
  import { iconOpacity, iconStrokeWidth } from '../shared/iconStyle'
  import type { PenSettings } from './settings'

  /** Lucide's pen-line in the pen's colour; the line it draws shows the width and opacity. */
  let { settings, size }: { settings: PenSettings; size: number } = $props()

  const hex = $derived(rgbToHex(settings.color))
  // Very dark colours vanish on the dark toolbar strip: add a light halo.
  const dark = $derived(isDark(settings.color))
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke={hex}
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
  class:dark
>
  <path
    d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"
  />
  <path
    class="stroke"
    d="M13 21h8"
    stroke-width={iconStrokeWidth(settings.width, 1.25, 3.5)}
    stroke-opacity={iconOpacity(settings.opacity, 0.3)}
  />
</svg>

<style>
  svg {
    display: block;
  }
  .dark {
    filter: drop-shadow(0 0 1px var(--icon-halo)) drop-shadow(0 0 1px var(--icon-halo));
  }
</style>
