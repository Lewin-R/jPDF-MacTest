<script lang="ts">
  import ColorPicker from '../../ui/ColorPicker.svelte'
  import Segmented from '../../ui/Segmented.svelte'
  import Slider from '../../ui/Slider.svelte'
  import { PEN_PRESETS } from '../pen/settings'
  import { BACKGROUND_PRESETS, DEFAULT_BACKGROUND, type TextSettings } from './settings'

  let { settings, update }: { settings: TextSettings; update(patch: Partial<TextSettings>): void } = $props()
</script>

<div class="options">
  <ColorPicker
    label="Text colour"
    value={settings.textColor}
    presets={PEN_PRESETS}
    onchange={(textColor) => update({ textColor })}
  />
  <Slider
    label="Font size"
    min={8}
    max={72}
    step={1}
    value={settings.fontSize}
    format={(v) => `${v} pt`}
    onchange={(fontSize) => update({ fontSize })}
  />
  <Segmented
    label="Background"
    options={[
      { value: 'none', label: 'Transparent' },
      { value: 'color', label: 'Colour' },
    ]}
    value={settings.background ? 'color' : 'none'}
    onchange={(v) => update({ background: v === 'color' ? (settings.background ?? DEFAULT_BACKGROUND) : null })}
  />
  {#if settings.background}
    {@const bg = settings.background}
    <ColorPicker
      label="Background colour"
      value={bg.color}
      presets={BACKGROUND_PRESETS}
      onchange={(color) => update({ background: { ...bg, color } })}
    />
    <Slider
      label="Background opacity"
      min={0}
      max={100}
      step={5}
      value={Math.round(bg.opacity * 100)}
      format={(v) => `${v}%`}
      onchange={(v) => update({ background: { ...bg, opacity: v / 100 } })}
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
