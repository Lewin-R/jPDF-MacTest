<script lang="ts">
  /**
   * App wordmark. The compact "jPDF" fits the title bar; `full` spells out
   * "juliePDF" for roomier spots like the start page. The accent span covers
   * the whole "julie" so both variants read as the same mark.
   */
  let { size = 'sm', full = false }: { size?: 'sm' | 'lg'; full?: boolean } = $props()
</script>

<span class="logo" class:lg={size === 'lg'}
  ><span class="logo-j">{full ? 'julie' : 'j'}</span><span class="logo-pdf">PDF</span></span
>

<style>
  .logo {
    font-family: var(--font-logo);
    font-weight: 600;
    font-size: 16px;
    letter-spacing: -0.02em;
    line-height: 1;
  }
  .logo.lg {
    font-size: 56px;
  }
  .logo-j {
    color: var(--accent);
  }
  .logo-pdf {
    color: var(--text-strong);
  }
</style>
