<script lang="ts">
  import { isDark, rgbToHex } from '../../ui/color'
  import { iconOpacity } from '../shared/iconStyle'
  import type { TextSettings } from './settings'

  /**
   * "Insert text": the font size (pt, number only) in the text colour, on the
   * box background (colour and opacity) when there is one, with a "+" at the
   * bottom right. Sets it apart from the marker's highlighted "T".
   */
  let { settings, size }: { settings: TextSettings; size: number } = $props()

  const hex = $derived(rgbToHex(settings.textColor))
  const bg = $derived(settings.background)
  // Very dark colours vanish on the dark toolbar strip: add a light halo,
  // unless the number sits on a light, mostly opaque background anyway.
  const onLight = $derived(!!bg && !isDark(bg.color) && bg.opacity >= 0.5)
  const dark = $derived(isDark(settings.textColor) && !onLight)
  const label = $derived(String(Math.round(settings.fontSize)))
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
>
  {#if bg}
    <rect
      class="background"
      x="1.5"
      y="1.5"
      width="21"
      height="21"
      rx="3"
      stroke="none"
      fill={rgbToHex(bg.color)}
      fill-opacity={iconOpacity(bg.opacity, 0.15)}
    />
  {/if}
  <g class="glyph" class:dark>
    <!-- Narrowed to fit two digits; three never occur (max 72 pt). -->
    <text
      class="size"
      x="10"
      y="13.5"
      text-anchor="middle"
      textLength={label.length > 1 ? 16 : undefined}
      lengthAdjust="spacingAndGlyphs"
      fill={hex}
      stroke="none">{label}</text
    >
    <path class="plus" d="M19.5 16.5v5M17 19h5" stroke={hex} />
  </g>
</svg>

<style>
  svg {
    display: block;
  }
  .size {
    font-family: var(--font-ui);
    font-size: 13.5px;
    font-weight: 700;
  }
  .dark {
    filter: drop-shadow(0 0 1px var(--icon-halo)) drop-shadow(0 0 1px var(--icon-halo));
  }
</style>
