<script lang="ts">
  import Segmented from '../../ui/Segmented.svelte'
  import StyleControls from './StyleControls.svelte'
  import type { ShapeSettings, ShapeStyle, StyleMemory } from './settings'

  let { settings, update }: { settings: ShapeSettings; update(patch: Partial<ShapeSettings>): void } = $props()

  const style = (s: ShapeStyle) => update({ border: s.border, fill: s.fill })

  /** The style plus the memory, which lives in the tool's settings (persisted with the toolbar). */
  function commit(s: ShapeStyle, m: StyleMemory) {
    const patch: Partial<ShapeSettings> = { border: s.border, fill: s.fill }
    if (m.lastBorder) patch.lastBorder = m.lastBorder
    if (m.lastFill) patch.lastFill = m.lastFill
    update(patch)
  }
</script>

<div class="options">
  <Segmented
    label="Shape"
    options={[
      { value: 'rect', label: 'Rectangle' },
      { value: 'circle', label: 'Circle' },
    ]}
    value={settings.shape}
    onchange={(shape) => update({ shape })}
  />
  <StyleControls
    style={{ border: settings.border, fill: settings.fill }}
    memory={{ lastBorder: settings.lastBorder, lastFill: settings.lastFill }}
    onchange={style}
    oncommit={commit}
  />
</div>

<style>
  .options {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
</style>
