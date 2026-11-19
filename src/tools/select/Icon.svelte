<script lang="ts">
  import MousePointer2 from '@lucide/svelte/icons/mouse-pointer-2'

  let { size }: { settings: unknown; size: number } = $props()
</script>

<MousePointer2 {size} />
