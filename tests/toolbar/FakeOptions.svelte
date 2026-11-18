<script lang="ts">
  let { settings, update }: { settings: { width: number }; update(p: { width: number }): void } = $props()
</script>

<button type="button" onclick={() => update({ width: settings.width + 1 })}>Width {settings.width}</button>
