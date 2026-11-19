<script lang="ts">
  import Segmented from '../../ui/Segmented.svelte'
  import type { LineStyle } from '../select/styleTypes'
  import StyleControls from './StyleControls.svelte'

  // Style card of selected lines, polylines and arrows: an arrowhead at the
  // last point (the shape tool's Arrow) on or off, and the line's stroke.
  let {
    value,
    onchange,
    oncommit,
  }: {
    value: LineStyle
    onchange(patch: Partial<LineStyle>): void
    oncommit(patch: Partial<LineStyle>): void
  } = $props()
</script>

<Segmented
  label="Line end"
  options={[
    { value: 'plain', label: 'Plain' },
    { value: 'arrow', label: 'Arrow' },
  ]}
  value={value.arrow ? 'arrow' : 'plain'}
  onchange={(v) => oncommit({ arrow: v === 'arrow' })}
/>
<!-- Lines always have a stroke. -->
<StyleControls
  strokeOnly
  style={{ border: value.border, fill: null }}
  onchange={(s) => s.border && onchange({ border: s.border })}
  oncommit={(s) => s.border && oncommit({ border: s.border })}
/>
