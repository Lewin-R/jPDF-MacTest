<script lang="ts">
  import LassoSelect from '@lucide/svelte/icons/lasso-select'

  let { size }: { settings: unknown; size: number } = $props()
</script>

<LassoSelect {size} />
