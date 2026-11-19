<script lang="ts">
  import type { RGB } from '../../core/session/model'
  import { isDark, prefersDarkInk, rgbToHex } from '../../ui/color'
  import { iconOpacity } from '../shared/iconStyle'
  import type { MarkerSettings } from './settings'

  /**
   * Shows the mode: text mode is a highlighted "T" (the square in the
   * marker's colour and opacity), freehand mode the marker pen in its colour.
   */
  let { settings, size }: { settings: MarkerSettings; size: number } = $props()

  const hex = $derived(rgbToHex(settings.color))
  // Very dark colours vanish on the dark toolbar strip: add a light halo.
  const dark = $derived(isDark(settings.color))

  const bandOpacity = $derived(iconOpacity(settings.opacity, 0.35))
  /** The toolbar strip (--bg-deep) the band is blended over. */
  const STRIP: RGB = [0.035, 0.043, 0.063]
  const darkInk = $derived(prefersDarkInk(settings.color, bandOpacity, STRIP))
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
  data-mode={settings.mode}
>
  {#if settings.mode === 'text'}
    <rect
      class="band"
      class:dark
      x="3"
      y="3"
      width="18"
      height="18"
      rx="2.5"
      stroke="none"
      fill={hex}
      fill-opacity={bandOpacity}
    />
    <!-- A highlighted "T", in whichever ink reads better on the band. -->
    <path class="glyph" class:ink-dark={darkInk} d="M12 7.5v9M8 9V7.5h8V9M10 16.5h4" stroke="currentColor" />
  {:else}
    <!-- Lucide's highlighter. -->
    <g class:dark stroke={hex}>
      <path d="m9 11-6 6v3h9l3-3" />
      <path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4" />
    </g>
  {/if}
</svg>

<style>
  svg {
    display: block;
  }
  .glyph {
    color: var(--text-strong);
  }
  .glyph.ink-dark {
    color: var(--bg-deep);
  }
  .dark {
    filter: drop-shadow(0 0 1px var(--icon-halo)) drop-shadow(0 0 1px var(--icon-halo));
  }
</style>
