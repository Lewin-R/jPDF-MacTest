<script lang="ts">
  import type { RGB } from '../../core/session/model'
  import LineIcon from './LineIcon.svelte'

  let { settings, size }: { settings: { color: RGB }; size: number } = $props()
</script>

<LineIcon color={settings.color} {size} letter={['M6 4v6a6 6 0 0 0 12 0V4']} line={20} />
