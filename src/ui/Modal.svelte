<script lang="ts">
  import type { Snippet } from 'svelte'
  import { dismissable } from './dismissable'

  // Centred dialog over a dimmed backdrop. Escape or a pointer-down on the
  // backdrop closes it; focus moves into the dialog, stays there (Tab wraps)
  // and returns to the previously focused element on close.
  let {
    label,
    onclose,
    children,
  }: {
    label: string
    onclose(): void
    children: Snippet
  } = $props()

  let card: HTMLDivElement

  const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'

  function focusables(): HTMLElement[] {
    return [...card.querySelectorAll<HTMLElement>(FOCUSABLE)]
  }

  $effect(() => {
    const previous = document.activeElement as HTMLElement | null
    ;(focusables()[0] ?? card).focus()
    return () => previous?.focus?.()
  })

  function onKeydown(e: KeyboardEvent) {
    if (e.key !== 'Tab') return
    const f = focusables()
    if (f.length === 0) return
    const first = f[0]
    const last = f[f.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }
</script>

<div class="backdrop">
  <div
    class="card"
    role="dialog"
    aria-modal="true"
    aria-label={label}
    tabindex="-1"
    bind:this={card}
    onkeydown={onKeydown}
    use:dismissable={{ onclose }}
  >
    {@render children()}
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 30;
    display: grid;
    place-items: center;
    padding: 24px;
    background: var(--backdrop);
    animation: fade 150ms ease-out;
  }
  .card {
    max-width: min(640px, 100%);
    max-height: 100%;
    overflow: auto;
    padding: 20px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-soft);
    animation: rise 150ms ease-out;
  }
  .card:focus {
    outline: none;
  }
  @keyframes fade {
    from {
      opacity: 0;
    }
  }
  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(8px) scale(0.98);
    }
  }
</style>
