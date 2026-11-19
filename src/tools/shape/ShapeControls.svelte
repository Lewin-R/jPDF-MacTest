<script lang="ts">
  import Segmented from '../../ui/Segmented.svelte'
  import type { ShapeKindStyle } from '../select/styleTypes'
  import StyleControls from './StyleControls.svelte'
  import type { StyleMemory } from './settings'

  // Style card of selected rectangles and circles: the shape tool's
  // Rectangle / Circle choice and its border and fill controls. `memory`
  // restores a border or fill turned off earlier (oncommit reports the new one).
  let {
    value,
    memory = {},
    onchange,
    oncommit,
  }: {
    value: ShapeKindStyle
    memory?: StyleMemory
    onchange(patch: Partial<ShapeKindStyle>): void
    oncommit(patch: Partial<ShapeKindStyle>, memory?: StyleMemory): void
  } = $props()
</script>

<Segmented
  label="Shape"
  options={[
    { value: 'rect', label: 'Rectangle' },
    { value: 'circle', label: 'Circle' },
  ]}
  value={value.shape}
  onchange={(shape) => oncommit({ shape })}
/>
<StyleControls
  style={{ border: value.border, fill: value.fill }}
  {memory}
  onchange={(s) => onchange({ border: s.border, fill: s.fill })}
  oncommit={(s, m) => oncommit({ border: s.border, fill: s.fill }, m)}
/>
