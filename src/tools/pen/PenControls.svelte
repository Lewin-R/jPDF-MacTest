<script lang="ts">
  import ColorPicker from '../../ui/ColorPicker.svelte'
  import Slider from '../../ui/Slider.svelte'
  import type { PenStyle } from '../select/styleTypes'
  import { PEN_PRESETS } from './settings'

  // Pen stroke controls: the pen tool's options and the Style card of
  // selected pen strokes (`onchange` while dragging, `oncommit` the final value).
  let {
    value,
    onchange,
    oncommit,
  }: {
    value: PenStyle
    onchange(patch: Partial<PenStyle>): void
    oncommit(patch: Partial<PenStyle>): void
  } = $props()
</script>

<ColorPicker
  value={value.color}
  presets={PEN_PRESETS}
  onchange={(color) => onchange({ color })}
  oncommit={(color) => oncommit({ color })}
/>
<Slider
  label="Width"
  min={0.5}
  max={20}
  step={0.5}
  value={value.width}
  format={(v) => `${v} pt`}
  onchange={(width) => onchange({ width })}
  oncommit={(width) => oncommit({ width })}
/>
<Slider
  label="Opacity"
  min={10}
  max={100}
  step={5}
  value={Math.round(value.opacity * 100)}
  format={(v) => `${v}%`}
  onchange={(v) => onchange({ opacity: v / 100 })}
  oncommit={(v) => oncommit({ opacity: v / 100 })}
/>
