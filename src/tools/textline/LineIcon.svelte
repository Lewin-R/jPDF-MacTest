<script lang="ts">
  import type { RGB } from '../../core/session/model'
  import { rgbToHex } from '../../ui/color'

  /** A letter in the toolbar's text colour with the line in the tool's colour. */
  let { color, size, letter, line }: { color: RGB; size: number; letter: string[]; line: number } = $props()

  const hex = $derived(rgbToHex(color))
  // Very dark colours vanish on the dark toolbar strip: add a light halo.
  const dark = $derived(0.2126 * color[0] + 0.7152 * color[1] + 0.0722 * color[2] < 0.2)
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  {#each letter as d (d)}
    <path {d} />
  {/each}
  <line x1="4" x2="20" y1={line} y2={line} stroke={hex} stroke-width="2.5" class:dark />
</svg>

<style>
  svg {
    display: block;
  }
  .dark {
    filter: drop-shadow(0 0 1px var(--icon-halo)) drop-shadow(0 0 1px var(--icon-halo));
  }
</style>
