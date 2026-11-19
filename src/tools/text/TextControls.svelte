<script lang="ts">
  import ColorPicker from '../../ui/ColorPicker.svelte'
  import Section from '../../ui/Section.svelte'
  import Segmented from '../../ui/Segmented.svelte'
  import Slider from '../../ui/Slider.svelte'
  import type { TextAlign } from '../../core/session/model'
  import { PEN_PRESETS } from '../pen/settings'
  import type { TextStyle } from '../select/styleTypes'
  import { BACKGROUND_PRESETS, DEFAULT_BACKGROUND, FONT_SIZE_MAX, FONT_SIZE_MIN } from './settings'

  // Text box style controls: the text tool's options and a selected box's
  // Style card. `onchange` reports each step of a drag (slider, custom
  // colour), `oncommit` the final value; both with only the changed fields.
  // Alignment, used less often, comes last in its own section.
  let {
    value,
    onchange,
    oncommit,
  }: {
    value: TextStyle
    onchange(patch: Partial<TextStyle>): void
    oncommit(patch: Partial<TextStyle>): void
  } = $props()

  const ALIGN_OPTIONS: { value: TextAlign; label: string }[] = [
    { value: 'left', label: 'Left' },
    { value: 'center', label: 'Centre' },
    { value: 'right', label: 'Right' },
  ]
</script>

<ColorPicker
  label="Text colour"
  value={value.textColor}
  presets={PEN_PRESETS}
  onchange={(textColor) => onchange({ textColor })}
  oncommit={(textColor) => oncommit({ textColor })}
/>
<Slider
  label="Font size"
  min={FONT_SIZE_MIN}
  max={FONT_SIZE_MAX}
  step={1}
  value={value.fontSize}
  format={(v) => `${v} pt`}
  onchange={(fontSize) => onchange({ fontSize })}
  oncommit={(fontSize) => oncommit({ fontSize })}
/>
<Section title="Background">
  <Segmented
    label="Background"
    options={[
      { value: 'none', label: 'Transparent' },
      { value: 'color', label: 'Colour' },
    ]}
    value={value.background ? 'color' : 'none'}
    onchange={(v) => oncommit({ background: v === 'color' ? (value.background ?? DEFAULT_BACKGROUND) : null })}
  />
  {#if value.background}
    {@const bg = value.background}
    <ColorPicker
      label="Background colour"
      value={bg.color}
      presets={BACKGROUND_PRESETS}
      onchange={(color) => onchange({ background: { ...bg, color } })}
      oncommit={(color) => oncommit({ background: { ...bg, color } })}
    />
    <Slider
      label="Background opacity"
      min={0}
      max={100}
      step={5}
      value={Math.round(bg.opacity * 100)}
      format={(v) => `${v}%`}
      onchange={(v) => onchange({ background: { ...bg, opacity: v / 100 } })}
      oncommit={(v) => oncommit({ background: { ...bg, opacity: v / 100 } })}
    />
  {/if}
</Section>
<Section title="Alignment">
  <Segmented label="Alignment" options={ALIGN_OPTIONS} value={value.align} onchange={(align) => oncommit({ align })} />
</Section>
