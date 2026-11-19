<script lang="ts">
  import Segmented from '../../ui/Segmented.svelte'
  import StyleControls from './StyleControls.svelte'
  import type { ShapeSettings, ShapeStyle } from './settings'

  let { settings, update }: { settings: ShapeSettings; update(patch: Partial<ShapeSettings>): void } = $props()

  const style = (s: ShapeStyle) => update({ border: s.border, fill: s.fill })
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
    onchange={style}
    oncommit={style}
  />
</div>

<style>
  .options {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
</style>
