<script lang="ts">
  import type { RGB } from '../../core/session/model'
  import { isDark, rgbToHex } from '../../ui/color'
  import { iconOpacity, iconStrokeWidth } from '../shared/iconStyle'
  import { isLineShape, lineBorder, type ShapeSettings } from './settings'

  /**
   * A mini preview of what the tool draws: the current shape with its border
   * (colour, width, opacity) and fill. A shape without border gets a faint
   * dashed outline in the toolbar's text colour, so it keeps its outline
   * (and reads as "no border") even with a faint fill.
   */
  let { settings, size }: { settings: ShapeSettings; size: number } = $props()

  const line = $derived(isLineShape(settings.shape))
  // Lines always have a stroke: the border, or the one last turned off.
  const border = $derived(line ? lineBorder(settings) : settings.border)
  const fill = $derived(line ? null : settings.fill)

  const stroke = $derived(
    border
      ? {
          color: rgbToHex(border.color),
          width: iconStrokeWidth(border.width),
          opacity: iconOpacity(border.opacity, 0.3),
        }
      : null,
  )
  // Box shapes only; `fill="none"` for lines and shapes without fill.
  const paint = $derived(fill ? { color: rgbToHex(fill.color), opacity: iconOpacity(fill.opacity, 0.15) } : null)

  // Very dark colours vanish on the dark toolbar strip: add a light halo.
  const shown: RGB = $derived(border?.color ?? fill?.color ?? [0, 0, 0])
  const dark = $derived(isDark(shown))
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
  data-shape={settings.shape}
>
  <g
    class:dark
    fill={paint?.color ?? 'none'}
    fill-opacity={paint?.opacity}
    stroke={stroke?.color ?? 'currentColor'}
    stroke-width={stroke?.width ?? 1}
    stroke-opacity={stroke?.opacity ?? 0.6}
    stroke-dasharray={stroke ? undefined : '2 2'}
  >
    {#if settings.shape === 'rect'}
      <rect x="4" y="5" width="16" height="14" rx="1.5" />
    {:else if settings.shape === 'circle'}
      <circle cx="12" cy="12" r="8" />
    {:else if settings.shape === 'line'}
      <line x1="5" y1="19" x2="19" y2="5" />
    {:else if settings.shape === 'arrow'}
      <!-- One path: its stroke is painted once, so the head doesn't darken where it meets the shaft. -->
      <path d="M5 19 18 6M10 6h8v8" />
    {:else}
      <polyline points="4,18 9,8 14,15 20,6" />
    {/if}
  </g>
</svg>

<style>
  svg {
    display: block;
  }
  .dark {
    filter: drop-shadow(0 0 1px var(--icon-halo)) drop-shadow(0 0 1px var(--icon-halo));
  }
</style>
