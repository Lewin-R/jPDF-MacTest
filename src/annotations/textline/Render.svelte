<script lang="ts">
  import type { PageViewport } from 'pdfjs-dist'
  import type { TextLineAnnotation } from '../../core/session/model'
  import { textLineBand } from '../../core/geometry/textLines'

  let { a, vp }: { a: TextLineAnnotation; vp: PageViewport; selected: boolean } = $props()

  const color = $derived(`rgb(${a.color.map((c) => Math.round(c * 255)).join(',')})`)
  // One filled path for all lines (one element however many lines): each line
  // is a thin band quad, so lines of different heights and rotations need no
  // per-line stroke width.
  const d = $derived.by(() => {
    let out = ''
    for (const q of a.quads) {
      const b = textLineBand(q, a.kind)
      const [x0, y0] = vp.convertToViewportPoint(b[0], b[1])
      const [x1, y1] = vp.convertToViewportPoint(b[2], b[3])
      const [x2, y2] = vp.convertToViewportPoint(b[6], b[7])
      const [x3, y3] = vp.convertToViewportPoint(b[4], b[5])
      out += `M${x0} ${y0}L${x1} ${y1}L${x2} ${y2}L${x3} ${y3}Z`
    }
    return out
  })
</script>

<g>
  <path {d} fill={color} />
</g>
