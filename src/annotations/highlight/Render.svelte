<script lang="ts">
  import type { PageViewport } from 'pdfjs-dist'
  import type { HighlightAnnotation } from '../../core/session/model'
  import { quadOutline } from '../../core/geometry/quads'

  let { a, vp }: { a: HighlightAnnotation; vp: PageViewport; selected: boolean } = $props()

  const color = $derived(`rgb(${a.color.map((c) => Math.round(c * 255)).join(',')})`)
  const polygons = $derived(
    a.quads.map((q) =>
      quadOutline(q)
        .map(([x, y]) => vp.convertToViewportPoint(x, y).join(','))
        .join(' '),
    ),
  )
</script>

<g style:mix-blend-mode="multiply">
  {#each polygons as points, i (i)}
    <polygon {points} fill={color} fill-opacity={a.opacity} />
  {/each}
</g>
