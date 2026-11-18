<script lang="ts">
  import type { PageViewport } from 'pdfjs-dist'
  import type { PdfDoc } from './pdfEngine'
  import type { AnnotationStore } from '../session/store.svelte'
  import type { Annotation, Point } from '../session/model'
  import type { PagePointerEvent, ToolHandler } from '../registry/tools'
  import { annotationKinds } from '../registry/annotationKinds'

  let {
    doc,
    pageNumber,
    scale,
    store,
    preview = null,
    tool = null,
    cursor,
    viewport,
  }: {
    doc?: PdfDoc
    /** 1-based (PdfDoc.getPage); Annotation.page is 0-based. */
    pageNumber: number
    /** CSS scale (not multiplied by devicePixelRatio). */
    scale: number
    store: AnnotationStore
    /** In-progress annotation drawn on top (tool preview). */
    preview?: Annotation | null
    /** Active tool's handler; the overlay takes pointer input only when set. */
    tool?: ToolHandler | null
    /** CSS cursor while a tool is active. */
    cursor?: string
    /** Overrides the viewport derived from doc (tests). */
    viewport?: PageViewport
  } = $props()

  let loaded = $state<PageViewport | null>(null)
  const vp = $derived(viewport ?? loaded)

  $effect(() => {
    if (viewport || !doc) return
    const s = scale
    let cancelled = false
    doc
      .getPage(pageNumber)
      .then((page) => {
        // getViewport applies the page's own rotation by default.
        if (!cancelled) loaded = page.getViewport({ scale: s })
      })
      .catch((e: unknown) => {
        // Cancelled loads and loads of a closed tab's doc reject by design.
        if (!cancelled && !doc.destroyed) console.error(`Failed to load page ${pageNumber}`, e)
      })
    return () => {
      cancelled = true
    }
  })

  const annotations = $derived(store.byPage(pageNumber - 1))

  let el: SVGSVGElement
  /** Pointer of the gesture in progress and the handler that received its pointerdown. */
  let gesture: { pointerId: number; tool: ToolHandler } | null = null

  function toPageEvent(e: PointerEvent, v: PageViewport): PagePointerEvent {
    const r = el.getBoundingClientRect()
    const sx = e.clientX - r.left
    const sy = e.clientY - r.top
    // The box can be CSS-scaled (zoom preview) relative to the viewport units.
    const kx = r.width > 0 ? v.width / r.width : 1
    const ky = r.height > 0 ? v.height / r.height : 1
    const [px, py] = v.convertToPdfPoint(sx * kx, sy * ky)
    return { page: pageNumber - 1, pdf: [px, py] as Point, screen: [sx, sy], vp: v, native: e }
  }

  function onPointerDown(e: PointerEvent) {
    if (!tool || !vp || e.button !== 0 || gesture) return
    gesture = { pointerId: e.pointerId, tool }
    el.setPointerCapture?.(e.pointerId)
    tool.onPointerDown?.(toPageEvent(e, vp))
  }

  /** The gesture's handler, if `e` belongs to it and that tool is still active. */
  function gestureTool(e: PointerEvent): ToolHandler | null {
    if (!gesture || gesture.pointerId !== e.pointerId) return null
    if (gesture.tool !== tool || !vp) {
      gesture = null
      return null
    }
    return gesture.tool
  }

  function onPointerMove(e: PointerEvent) {
    const t = gestureTool(e)
    if (t && vp) t.onPointerMove?.(toPageEvent(e, vp))
  }

  /** pointerup, pointercancel and an unexpected loss of capture all end the gesture. */
  function onPointerEnd(e: PointerEvent) {
    const t = gestureTool(e)
    if (!t || !vp) return
    gesture = null
    t.onPointerUp?.(toPageEvent(e, vp))
  }
</script>

<!-- Same CSS box as the canvas, so it scales with it during the zoom preview. -->
<!-- viewBox = the viewport's own size, so a stale viewport (scale just changed,
     page not yet reloaded) still scales with the resized box. -->
<svg
  bind:this={el}
  class="overlay"
  class:interactive={tool}
  style:cursor={tool ? cursor : undefined}
  onpointerdown={onPointerDown}
  onpointermove={onPointerMove}
  onpointerup={onPointerEnd}
  onpointercancel={onPointerEnd}
  onlostpointercapture={onPointerEnd}
  role="presentation"
  width="100%"
  height="100%"
  viewBox={vp ? `0 0 ${vp.width} ${vp.height}` : undefined}
  preserveAspectRatio="none"
>
  {#if vp}
    {#each annotations as a (a.id)}
      {@const K = annotationKinds.get(a.kind)}
      <K.Render {a} {vp} selected={false} />
    {/each}
    {#if preview}
      {@const K = annotationKinds.get(preview.kind)}
      <K.Render a={preview} {vp} selected={false} />
    {/if}
  {/if}
</svg>

<style>
  .overlay {
    position: absolute;
    inset: 0;
    overflow: hidden;
    /* Click-through unless a tool takes pointer input. */
    pointer-events: none;
  }
  .interactive {
    pointer-events: auto;
    /* Pen and touch draw instead of scrolling. */
    touch-action: none;
  }
</style>
