<script lang="ts" generics="T extends string">
  let {
    options,
    value,
    onchange,
    label,
  }: {
    options: { value: T; label: string }[]
    value: T
    onchange(v: T): void
    label: string
  } = $props()

  function onKeydown(e: KeyboardEvent) {
    const delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!delta) return
    e.preventDefault()
    const i = options.findIndex((o) => o.value === value)
    const next = options[(i + delta + options.length) % options.length]
    onchange(next.value)
    const group = e.currentTarget as HTMLElement
    queueMicrotask(() => group.querySelector<HTMLElement>('[aria-checked="true"]')?.focus())
  }
</script>

<div class="segmented" role="radiogroup" aria-label={label} tabindex="-1" onkeydown={onKeydown}>
  {#each options as o (o.value)}
    <button
      type="button"
      role="radio"
      aria-checked={o.value === value}
      tabindex={o.value === value ? 0 : -1}
      onclick={() => onchange(o.value)}
    >
      {o.label}
    </button>
  {/each}
</div>

<style>
  .segmented {
    display: flex;
    padding: 2px;
    gap: 2px;
    border-radius: var(--radius-sm);
    background: var(--bg-deep);
  }
  button {
    flex: 1;
    padding: 4px 10px;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--text);
    cursor: pointer;
    transition: background var(--transition), color var(--transition);
  }
  button:hover {
    color: var(--text-strong);
  }
  button[aria-checked='true'] {
    background: var(--surface-hover);
    color: var(--text-strong);
  }
</style>
