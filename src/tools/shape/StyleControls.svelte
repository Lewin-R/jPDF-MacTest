<script lang="ts">
  import ColorPicker from '../../ui/ColorPicker.svelte'
  import Segmented from '../../ui/Segmented.svelte'
  import Slider from '../../ui/Slider.svelte'
  import { MARKER_PRESETS } from '../marker/settings'
  import { PEN_PRESETS } from '../pen/settings'
  import { DEFAULT_BORDER, DEFAULT_FILL, withBorder, withFill, type ShapeStyle } from './settings'

  // Border and fill controls of the shape tool's options and of a selected
  // shape. Every change reports the whole style: `onchange` for each step of a
  // drag (slider, custom colour), `oncommit` for the final value.
  let {
    style,
    onchange,
    oncommit,
  }: { style: ShapeStyle; onchange(s: ShapeStyle): void; oncommit(s: ShapeStyle): void } = $props()

  const pct = (v: number) => `${v}%`
  const pt = (v: number) => `${v} pt`
</script>

<Segmented
  label="Border"
  options={[
    { value: 'none', label: 'None' },
    { value: 'border', label: 'Border' },
  ]}
  value={style.border ? 'border' : 'none'}
  onchange={(v) => oncommit(withBorder(style, v === 'border' ? (style.border ?? DEFAULT_BORDER) : null))}
/>
{#if style.border}
  {@const b = style.border}
  <ColorPicker
    label="Border colour"
    value={b.color}
    presets={PEN_PRESETS}
    onchange={(color) => onchange({ ...style, border: { ...b, color } })}
    oncommit={(color) => oncommit({ ...style, border: { ...b, color } })}
  />
  <Slider
    label="Border width"
    min={0.5}
    max={20}
    step={0.5}
    value={b.width}
    format={pt}
    onchange={(width) => onchange({ ...style, border: { ...b, width } })}
    oncommit={(width) => oncommit({ ...style, border: { ...b, width } })}
  />
  <Slider
    label="Border opacity"
    min={10}
    max={100}
    step={5}
    value={Math.round(b.opacity * 100)}
    format={pct}
    onchange={(v) => onchange({ ...style, border: { ...b, opacity: v / 100 } })}
    oncommit={(v) => oncommit({ ...style, border: { ...b, opacity: v / 100 } })}
  />
{/if}
<Segmented
  label="Fill"
  options={[
    { value: 'none', label: 'None' },
    { value: 'fill', label: 'Fill' },
  ]}
  value={style.fill ? 'fill' : 'none'}
  onchange={(v) => oncommit(withFill(style, v === 'fill' ? (style.fill ?? DEFAULT_FILL) : null))}
/>
{#if style.fill}
  {@const f = style.fill}
  <ColorPicker
    label="Fill colour"
    value={f.color}
    presets={MARKER_PRESETS}
    onchange={(color) => onchange({ ...style, fill: { ...f, color } })}
    oncommit={(color) => oncommit({ ...style, fill: { ...f, color } })}
  />
  <Slider
    label="Fill opacity"
    min={0}
    max={100}
    step={5}
    value={Math.round(f.opacity * 100)}
    format={pct}
    onchange={(v) => onchange({ ...style, fill: { ...f, opacity: v / 100 } })}
    oncommit={(v) => oncommit({ ...style, fill: { ...f, opacity: v / 100 } })}
  />
{/if}
