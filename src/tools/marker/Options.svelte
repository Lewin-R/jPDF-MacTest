<script lang="ts">
  import ColorPicker from '../../ui/ColorPicker.svelte'
  import Segmented from '../../ui/Segmented.svelte'
  import Slider from '../../ui/Slider.svelte'
  import { MARKER_PRESETS, type MarkerSettings } from './settings'

  let { settings, update }: { settings: MarkerSettings; update(patch: Partial<MarkerSettings>): void } = $props()
</script>

<div class="options">
  <Segmented
    label="Marker mode"
    options={[
      { value: 'text', label: 'Text' },
      { value: 'freehand', label: 'Freehand' },
    ]}
    value={settings.mode}
    onchange={(mode) => update({ mode })}
  />
  <ColorPicker value={settings.color} presets={MARKER_PRESETS} onchange={(color) => update({ color })} />
  <Slider
    label="Opacity"
    min={10}
    max={100}
    step={5}
    value={Math.round(settings.opacity * 100)}
    format={(v) => `${v}%`}
    onchange={(v) => update({ opacity: v / 100 })}
  />
  {#if settings.mode === 'freehand'}
    <Slider
      label="Thickness"
      min={4}
      max={40}
      step={1}
      value={settings.width}
      format={(v) => `${v} pt`}
      onchange={(width) => update({ width })}
    />
  {/if}
</div>

<style>
  .options {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
</style>
