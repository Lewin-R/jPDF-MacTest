<script lang="ts">
  import type { PageViewport } from 'pdfjs-dist'
  import { arrowHead } from '../../core/geometry/arrow'
  import type { LineAnnotation, Point } from '../../core/session/model'
  import { cssColor } from '../freetext/screen'

  let { a, vp }: { a: LineAnnotation; vp: PageViewport; selected: boolean } = $props()

  const xy = (p: Point) => {
    const [x, y] = vp.convertToViewportPoint(p[0], p[1])
    return `${x} ${y}`
  }
  // One path for line and arrowhead: where they meet, a translucent stroke is
  // not darkened twice (as in the saved appearance).
  const d = $derived.by(() => {
    let out = a.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xy(p)}`).join(' ')
    const head = a.arrow ? arrowHead(a.points, a.border.width) : null
    if (head) out += ` M${xy(head[0])} L${xy(head[1])} L${xy(head[2])}`
    return out
  })
</script>

<g>
  <path
    {d}
    fill="none"
    stroke={cssColor(a.border.color)}
    stroke-width={a.border.width * vp.scale}
    stroke-opacity={a.border.opacity < 1 ? a.border.opacity : undefined}
    stroke-linecap="round"
    stroke-linejoin="round"
  />
</g>
