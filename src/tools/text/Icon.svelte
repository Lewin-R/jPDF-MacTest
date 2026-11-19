<script lang="ts">
  import { isDark, rgbToHex } from '../../ui/color'
  import { layoutDigits } from '../shared/iconDigits'
  import { iconOpacity } from '../shared/iconStyle'
  import type { TextSettings } from './settings'

  /**
   * "Insert text": a selected text box (outline with four corner handles)
   * with the font size (pt, number only) centred in it in the text colour.
   * The box is filled with the background colour and opacity when there is
   * one. Sets it apart from the marker's highlighted "T".
   */
  let { settings, size }: { settings: TextSettings; size: number } = $props()

  /** The text box, in icon units: centred in the 24 × 24 viewBox. */
  const BOX = { x: 3.5, y: 5, width: 17, height: 14 }
  const HANDLE = 2.8
  const corners = [
    [BOX.x, BOX.y],
    [BOX.x + BOX.width, BOX.y],
    [BOX.x, BOX.y + BOX.height],
    [BOX.x + BOX.width, BOX.y + BOX.height],
  ]

  const hex = $derived(rgbToHex(settings.textColor))
  const bg = $derived(settings.background)
  // Very dark colours vanish on the dark toolbar strip: add a light halo,
  // unless the number sits on a light, mostly opaque background anyway.
  const onLight = $derived(!!bg && !isDark(bg.color) && bg.opacity >= 0.5)
  const dark = $derived(isDark(settings.textColor) && !onLight)
  const label = $derived(String(Math.round(settings.fontSize)))
  // Two digits fit at full height; a wider run shrinks to stay inside the box.
  const run = $derived(
    layoutDigits(label, { cx: 12, cy: 12, height: 7.5, strokeWidth: 1.8, maxWidth: BOX.width - 2 }),
  )
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  <rect
    class="box"
    x={BOX.x}
    y={BOX.y}
    width={BOX.width}
    height={BOX.height}
    fill={bg ? rgbToHex(bg.color) : 'none'}
    fill-opacity={bg ? iconOpacity(bg.opacity, 0.15) : undefined}
  />
  {#each corners as [cx, cy]}
    <rect class="handle" x={cx - HANDLE / 2} y={cy - HANDLE / 2} width={HANDLE} height={HANDLE} rx="0.6" />
  {/each}
  <g class="size" class:dark stroke={hex} stroke-width={run.strokeWidth} data-label={label}>
    {#each run.digits as digit}
      <path d={digit.d} transform={digit.transform} />
    {/each}
  </g>
</svg>

<style>
  svg {
    display: block;
  }
  .box {
    stroke: var(--text-strong);
    stroke-opacity: 0.5;
    stroke-width: 1;
  }
  .handle {
    fill: var(--bg-deep);
    stroke: var(--text-strong);
    stroke-width: 1.1;
  }
  .dark {
    filter: drop-shadow(0 0 1px var(--icon-halo)) drop-shadow(0 0 1px var(--icon-halo));
  }
</style>
