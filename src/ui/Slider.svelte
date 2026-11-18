<script lang="ts">
  let {
    min,
    max,
    step = 1,
    value,
    format = (v: number) => String(v),
    onchange,
    label,
  }: {
    min: number
    max: number
    step?: number
    value: number
    format?(v: number): string
    onchange(v: number): void
    label: string
  } = $props()

  const pct = $derived(((value - min) / (max - min)) * 100)
</script>

<label class="slider">
  <span class="head">
    <span class="label">{label}</span>
    <span class="value">{format(value)}</span>
  </span>
  <input
    type="range"
    {min}
    {max}
    {step}
    {value}
    aria-label={label}
    aria-valuetext={format(value)}
    style:--pct="{pct}%"
    oninput={(e) => onchange(Number((e.currentTarget as HTMLInputElement).value))}
  />
</label>

<style>
  .slider {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .head {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
  }
  .value {
    color: var(--text-strong);
    font-variant-numeric: tabular-nums;
  }
  input {
    appearance: none;
    width: 100%;
    height: 16px;
    margin: 0;
    background: transparent;
    cursor: pointer;
  }
  input::-webkit-slider-runnable-track {
    height: 4px;
    border-radius: 2px;
    background: linear-gradient(to right, var(--accent) var(--pct), var(--surface-hover) var(--pct));
  }
  input::-webkit-slider-thumb {
    appearance: none;
    width: 14px;
    height: 14px;
    margin-top: -5px;
    border-radius: 50%;
    background: var(--text-strong);
    transition: transform var(--transition);
  }
  input:hover::-webkit-slider-thumb {
    transform: scale(1.15);
  }
  input:focus-visible {
    outline: none;
  }
  input:focus-visible::-webkit-slider-thumb {
    box-shadow: 0 0 0 3px var(--accent-soft), 0 0 0 1px var(--accent);
  }
</style>
