<script lang="ts">
  import type { PageViewport } from 'pdfjs-dist'
  import type { InkAnnotation, Point } from '../../core/session/model'
  import { smoothPath } from '../../core/geometry/stroke'

  let { a, vp }: { a: InkAnnotation; vp: PageViewport; selected: boolean } = $props()

  const toScreen = (p: Point): Point => {
    const [x, y] = vp.convertToViewportPoint(p[0], p[1])
    return [x, y]
  }
  const color = $derived(`rgb(${a.color.map((c) => Math.round(c * 255)).join(',')})`)
  const multiply = $derived(a.blend === 'multiply')
</script>

<g style:mix-blend-mode={multiply ? 'multiply' : undefined}>
  {#each a.strokes as stroke, i (i)}
    <path
      d={smoothPath(stroke, toScreen)}
      fill="none"
      stroke={color}
      stroke-width={a.width * vp.scale}
      stroke-opacity={a.opacity}
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  {/each}
</g>
