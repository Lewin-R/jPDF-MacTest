<script lang="ts">
  import type { Snippet } from 'svelte'

  /**
   * A titled group of controls in an options card (e.g. "Background" of the
   * text tool). The title matches the card's own title (Flyout `h2`); a thin
   * rule above it separates the group from the controls before it.
   */
  let { title, children }: { title: string; children: Snippet } = $props()

  const id = `section-${Math.random().toString(36).slice(2, 9)}`
</script>

<section class="section" aria-labelledby={id}>
  <h3 {id}>{title}</h3>
  {@render children()}
</section>

<style>
  .section {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding-top: 12px;
    border-top: 1px solid var(--border);
  }
  /* Opening the card (e.g. a selected shape): the card's title is right above, no rule needed. */
  .section:first-child {
    padding-top: 0;
    border-top: none;
  }
  h3 {
    margin: 0;
    font-size: 12px;
    font-weight: 600;
    color: var(--text-strong);
  }
</style>
