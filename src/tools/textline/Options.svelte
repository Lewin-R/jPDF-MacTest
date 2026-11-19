<script lang="ts">
  import ColorPicker from '../../ui/ColorPicker.svelte'
  import { TEXT_LINE_PRESETS, type TextLineSettings } from './settings'

  let { settings, update }: { settings: TextLineSettings; update(patch: Partial<TextLineSettings>): void } =
    $props()
</script>

<ColorPicker value={settings.color} presets={TEXT_LINE_PRESETS} onchange={(color) => update({ color })} />
