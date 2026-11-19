<script lang="ts">
  import type { Annotation } from '../../core/session/model'
  import ColorPicker from '../../ui/ColorPicker.svelte'
  import Segmented from '../../ui/Segmented.svelte'
  import Slider from '../../ui/Slider.svelte'
  import { MARKER_PRESETS } from '../marker/settings'
  import { PEN_PRESETS } from '../pen/settings'
  import { selectionMemory } from '../shape/settings'
  import { TEXT_LINE_PRESETS } from '../textline/settings'
  import StyleControls from '../shape/StyleControls.svelte'
  import { BACKGROUND_PRESETS, DEFAULT_BACKGROUND } from '../text/settings'

  let { annotation, update }: { annotation: Annotation; update(after: Annotation): void } = $props()

  /** The value of a control being dragged (slider, custom colour), not committed yet. */
  let live = $state<{ id: string; key: string; value: unknown } | null>(null)

  function shown<T>(key: string, committed: T): T {
    return live && live.id === annotation.id && live.key === key ? (live.value as T) : committed
  }

  function preview(key: string, value: unknown) {
    live = { id: annotation.id, key, value }
  }

  /** One undo step per call. */
  function commit(patch: Record<string, unknown>) {
    live = null
    update({ ...annotation, ...patch } as Annotation)
  }

  const pct = (v: number) => `${v}%`
  const pt = (v: number) => `${v} pt`
</script>

<div class="options">
  {#if annotation.kind === 'ink'}
    {@const marker = annotation.role === 'marker'}
    <ColorPicker
      value={shown('color', annotation.color)}
      presets={marker ? MARKER_PRESETS : PEN_PRESETS}
      onchange={(v) => preview('color', v)}
      oncommit={(color) => commit({ color })}
    />
    <Slider
      label="Opacity"
      min={10}
      max={100}
      step={5}
      value={shown('opacity', Math.round(annotation.opacity * 100))}
      format={pct}
      onchange={(v) => preview('opacity', v)}
      oncommit={(v) => commit({ opacity: v / 100 })}
    />
    <Slider
      label={marker ? 'Thickness' : 'Width'}
      min={marker ? 4 : 0.5}
      max={marker ? 40 : 20}
      step={marker ? 1 : 0.5}
      value={shown('width', annotation.width)}
      format={pt}
      onchange={(v) => preview('width', v)}
      oncommit={(width) => commit({ width })}
    />
  {:else if annotation.kind === 'highlight'}
    <ColorPicker
      value={shown('color', annotation.color)}
      presets={MARKER_PRESETS}
      onchange={(v) => preview('color', v)}
      oncommit={(color) => commit({ color })}
    />
    <Slider
      label="Opacity"
      min={10}
      max={100}
      step={5}
      value={shown('opacity', Math.round(annotation.opacity * 100))}
      format={pct}
      onchange={(v) => preview('opacity', v)}
      oncommit={(v) => commit({ opacity: v / 100 })}
    />
  {:else if annotation.kind === 'underline' || annotation.kind === 'strikeout'}
    <ColorPicker
      value={shown('color', annotation.color)}
      presets={TEXT_LINE_PRESETS}
      onchange={(v) => preview('color', v)}
      oncommit={(color) => commit({ color })}
    />
  {:else if annotation.kind === 'freetext'}
    {@const bg = annotation.background}
    <ColorPicker
      label="Text colour"
      value={shown('textColor', annotation.textColor)}
      presets={PEN_PRESETS}
      onchange={(v) => preview('textColor', v)}
      oncommit={(textColor) => commit({ textColor })}
    />
    <Slider
      label="Font size"
      min={8}
      max={72}
      step={1}
      value={shown('fontSize', annotation.fontSize)}
      format={pt}
      onchange={(v) => preview('fontSize', v)}
      oncommit={(fontSize) => commit({ fontSize })}
    />
    <Segmented
      label="Background"
      options={[
        { value: 'none', label: 'Transparent' },
        { value: 'color', label: 'Colour' },
      ]}
      value={bg ? 'color' : 'none'}
      onchange={(v) => commit({ background: v === 'color' ? (bg ?? DEFAULT_BACKGROUND) : null })}
    />
    {#if bg}
      <ColorPicker
        label="Background colour"
        value={shown('bgColor', bg.color)}
        presets={BACKGROUND_PRESETS}
        onchange={(v) => preview('bgColor', v)}
        oncommit={(color) => commit({ background: { ...bg, color } })}
      />
      <Slider
        label="Background opacity"
        min={0}
        max={100}
        step={5}
        value={shown('bgOpacity', Math.round(bg.opacity * 100))}
        format={pct}
        onchange={(v) => preview('bgOpacity', v)}
        oncommit={(v) => commit({ background: { ...bg, opacity: v / 100 } })}
      />
    {/if}
  {:else if annotation.kind === 'shape'}
    <StyleControls
      style={shown('style', { border: annotation.border, fill: annotation.fill })}
      memory={selectionMemory.get(annotation.id)}
      onchange={(s) => preview('style', s)}
      oncommit={(s, m) => {
        selectionMemory.set(annotation.id, m)
        commit({ border: s.border, fill: s.fill })
      }}
    />
  {:else if annotation.kind === 'line'}
    <StyleControls
      strokeOnly
      style={shown('style', { border: annotation.border, fill: null })}
      onchange={(s) => preview('style', s)}
      oncommit={(s) => commit({ border: s.border })}
    />
  {:else if annotation.kind === 'image'}
    <p class="hint">Drag to move, drag a handle to resize, Delete removes it.</p>
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
