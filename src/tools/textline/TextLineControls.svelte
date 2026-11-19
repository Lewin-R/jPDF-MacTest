<script lang="ts">
  import ColorPicker from '../../ui/ColorPicker.svelte'
  import type { TextLineStyle } from '../select/styleTypes'
  import { TEXT_LINE_PRESETS } from './settings'

  // Underline / strike-out controls: the tools' options and the Style card.
  let {
    value,
    onchange,
    oncommit,
  }: {
    value: TextLineStyle
    onchange(patch: Partial<TextLineStyle>): void
    oncommit(patch: Partial<TextLineStyle>): void
  } = $props()
</script>

<ColorPicker
  value={value.color}
  presets={TEXT_LINE_PRESETS}
  onchange={(color) => onchange({ color })}
  oncommit={(color) => oncommit({ color })}
/>
