<script lang="ts">
  import Hand from '@lucide/svelte/icons/hand'

  let { size }: { settings: unknown; size: number } = $props()
</script>

<Hand {size} />
