<script lang="ts">
  import Segmented from '../../ui/Segmented.svelte'
  import StyleControls from './StyleControls.svelte'
  import { isLineShape, lineBorder, type ShapeSettings, type ShapeStyle, type StyleMemory } from './settings'

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
    value={isLineShape(settings.shape) ? undefined : settings.shape}
    onchange={(shape) => update({ shape })}
  />
  <Segmented
    label="Line"
    options={[
      { value: 'line', label: 'Line' },
      { value: 'polyline', label: 'Polyline' },
      { value: 'arrow', label: 'Arrow' },
    ]}
    value={isLineShape(settings.shape) ? settings.shape : undefined}
    onchange={(shape) => update({ shape })}
  />
  {#if isLineShape(settings.shape)}
    <!-- Lines always have a stroke: the border (or the one last turned off). -->
    <StyleControls
      strokeOnly
      style={{ border: lineBorder(settings), fill: null }}
      onchange={(s) => update({ border: s.border })}
      oncommit={(s) => update({ border: s.border })}
    />
    {#if settings.shape === 'polyline'}
      <p class="hint">Click to add points, double-click or Enter to finish.</p>
    {/if}
  {:else}
  <StyleControls
    style={{ border: settings.border, fill: settings.fill }}
    memory={{ lastBorder: settings.lastBorder, lastFill: settings.lastFill }}
    onchange={style}
    oncommit={commit}
  />
  {/if}
</div>

<style>
  .options {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .hint {
    margin: 0;
    max-width: 200px;
    font-size: 12px;
    color: var(--text-muted);
  }
</style>
