<script lang="ts">
  let { settings, size }: { settings: { color?: number[] }; size: number } = $props()
</script>

<span class="fake-icon" data-color={settings.color?.join(',')} data-size={size}></span>
