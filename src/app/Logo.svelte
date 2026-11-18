<script lang="ts">
  let { size = 'sm' }: { size?: 'sm' | 'lg' } = $props()
</script>

<span class="logo" class:lg={size === 'lg'}
  ><span class="logo-j">j</span><span class="logo-pdf">PDF</span></span
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
