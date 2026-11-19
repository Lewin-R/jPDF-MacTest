<script lang="ts">
  import type { RGB } from '../../core/session/model'
  import LineIcon from './LineIcon.svelte'

  let { settings, size }: { settings: { color: RGB }; size: number } = $props()
</script>

<LineIcon color={settings.color} {size} letter={['M16 4H9a3 3 0 0 0-2.83 4', 'M14 12a4 4 0 0 1 0 8H6']} line={12} />
