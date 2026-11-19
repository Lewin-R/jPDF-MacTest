import type { Command } from '../../core/session/history.svelte'
import type { InkAnnotation, Point } from '../../core/session/model'
import { addAnnotations } from '../../core/session/commands'
import { dedupe, simplify } from '../../core/geometry/stroke'
import type { PagePointerEvent, ToolContext, ToolHandler } from '../../core/registry/tools'
import { createPreviewFrame } from './previewFrame'

export interface StrokeCaptureOptions {
  ctx: ToolContext
  /** Builds the ink annotation for the given stroke; reads current settings. */
  build(points: Point[], page: number): InkAnnotation
  /**
   * When set, holding Shift at any point during the drag replaces the stroke
   * (committed and previewed) with `straight(start, current)`.
   */
  straight?(start: Point, current: Point): Point[]
  /** The command committing the finished stroke (default: add it). */
  commit?(a: InkAnnotation): Command
}

/** Pointer-driven freehand stroke capture shared by the pen and the marker. */
export function createStrokeCapture({ ctx, build, straight, commit }: StrokeCaptureOptions): ToolHandler {
  let points: Point[] | null = null
  let page = 0
  let shifted = false

  function current(): Point[] {
    const pts = points!
    return shifted && straight ? straight(pts[0], pts[pts.length - 1]) : pts.slice()
  }

  const preview = createPreviewFrame(ctx, () => (points ? build(current(), page) : null))

  function reset() {
    points = null
    shifted = false
    preview.clear()
  }

  const schedulePreview = preview.schedule

  return {
    onPointerDown(e: PagePointerEvent) {
      reset()
      page = e.page
      points = [e.pdf]
      shifted = !!straight && !!e.native.shiftKey
      schedulePreview()
    },
    onPointerMove(e: PagePointerEvent) {
      if (!points) return
      if (straight && e.native.shiftKey) shifted = true
      const coalesced = e.native.getCoalescedEvents?.() ?? []
      if (coalesced.length > 0) {
        for (const c of coalesced) points.push(e.toPdf(c.clientX, c.clientY))
      } else {
        points.push(e.pdf)
      }
      schedulePreview()
    },
    onPointerUp(e: PagePointerEvent) {
      if (!points) return
      if (straight && e.native.shiftKey) shifted = true
      const raw = points
      // The up event can carry a position the last move did not.
      const last = raw[raw.length - 1]
      if ((raw.length > 1 || shifted) && (last[0] !== e.pdf[0] || last[1] !== e.pdf[1])) raw.push(e.pdf)
      const scale = e.vp.scale
      const pts = shifted && straight ? current() : simplify(dedupe(raw, 0.5 / scale), 0.35 / scale)
      const pg = page
      reset()
      const a = build(pts, pg)
      ctx.execute(commit ? commit(a) : addAnnotations([a]))
    },
    onPointerCancel() {
      reset()
    },
    onDeactivate() {
      reset()
    },
  }
}
