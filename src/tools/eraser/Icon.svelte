<script lang="ts">
  import Eraser from '@lucide/svelte/icons/eraser'

  let { size }: { settings: unknown; size: number } = $props()
</script>

<Eraser {size} />
