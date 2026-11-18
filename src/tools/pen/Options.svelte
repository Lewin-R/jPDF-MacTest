<script lang="ts">
  import ColorPicker from '../../ui/ColorPicker.svelte'
  import Slider from '../../ui/Slider.svelte'
  import { PEN_PRESETS, type PenSettings } from './settings'

  let { settings, update }: { settings: PenSettings; update(patch: Partial<PenSettings>): void } = $props()
</script>

<div class="options">
  <ColorPicker value={settings.color} presets={PEN_PRESETS} onchange={(color) => update({ color })} />
  <Slider
    label="Width"
    min={0.5}
    max={20}
    step={0.5}
    value={settings.width}
    format={(v) => `${v} pt`}
    onchange={(width) => update({ width })}
  />
  <Slider
    label="Opacity"
    min={10}
    max={100}
    step={5}
    value={Math.round(settings.opacity * 100)}
    format={(v) => `${v}%`}
    onchange={(v) => update({ opacity: v / 100 })}
  />
</div>

<style>
  .options {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
</style>
