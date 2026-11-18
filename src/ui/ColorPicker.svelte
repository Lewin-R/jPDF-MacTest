<script lang="ts">
  import Pipette from '@lucide/svelte/icons/pipette'
  import type { RGB } from '../core/session/model'
  import { hexToRgb, rgbToHex } from './color'

  let {
    value,
    presets,
    onchange,
    label = 'Colour',
  }: {
    value: RGB
    presets: RGB[]
    onchange(v: RGB): void
    label?: string
  } = $props()

  const current = $derived(rgbToHex(value))
  const isCustom = $derived(!presets.some((p) => rgbToHex(p) === current))

  function onCustom(e: Event) {
    const rgb = hexToRgb((e.currentTarget as HTMLInputElement).value)
    if (rgb) onchange(rgb)
  }
</script>

<div class="picker" role="radiogroup" aria-label={label}>
  {#each presets as p (rgbToHex(p))}
    {@const hex = rgbToHex(p)}
    <button
      type="button"
      class="swatch"
      role="radio"
      aria-checked={hex === current}
      aria-label={hex}
      title={hex}
      style:--swatch={hex}
      onclick={() => onchange(p)}
    ></button>
  {/each}
  <label
    class="swatch custom"
    class:checked={isCustom}
    title="Custom colour"
    style:--swatch={isCustom ? current : 'transparent'}
  >
    {#if !isCustom}<Pipette size={13} />{/if}
    <input type="color" aria-label="Custom colour" value={current} oninput={onCustom} />
  </label>
</div>

<style>
  .picker {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .swatch {
    position: relative;
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: none;
    border-radius: 50%;
    background: var(--swatch);
    cursor: pointer;
    /* Hairline ring keeps dark colours visible on the dark surface. */
    box-shadow: inset 0 0 0 1px var(--surface-hover);
    transition: transform var(--transition), box-shadow var(--transition);
  }
  .swatch:hover {
    transform: scale(1.1);
  }
  .swatch[aria-checked='true'],
  .swatch.checked {
    box-shadow:
      0 0 0 2px var(--surface),
      0 0 0 4px var(--accent);
  }
  .custom:not(.checked) {
    color: var(--text);
    box-shadow: inset 0 0 0 1px var(--text-muted);
  }
  .custom:focus-within {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }
  .custom input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    opacity: 0;
    cursor: pointer;
    border: none;
    padding: 0;
  }
</style>
