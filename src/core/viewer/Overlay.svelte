<script lang="ts">
  import { onDestroy } from 'svelte'
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
    hidden,
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
    /** Annotation ids not drawn (erased during an uncommitted drag). */
    hidden?: ReadonlySet<string>
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
  /**
   * Gesture in progress: its pointer, the handler that received its pointerdown
   * and its latest page event (used to cancel when no native event is available).
   */
  let gesture: { pointerId: number; tool: ToolHandler; last: PagePointerEvent } | null = null

  /** Client coordinates → PDF user space. */
  function clientToPdf(clientX: number, clientY: number, v: PageViewport): Point {
    const r = el.getBoundingClientRect()
    // The box can be CSS-scaled (zoom preview) relative to the viewport units.
    const kx = r.width > 0 ? v.width / r.width : 1
    const ky = r.height > 0 ? v.height / r.height : 1
    const [px, py] = v.convertToPdfPoint((clientX - r.left) * kx, (clientY - r.top) * ky)
    return [px, py]
  }

  function toPageEvent(e: PointerEvent, v: PageViewport): PagePointerEvent {
    const r = el.getBoundingClientRect()
    return {
      page: pageNumber - 1,
      pdf: clientToPdf(e.clientX, e.clientY, v),
      screen: [e.clientX - r.left, e.clientY - r.top],
      vp: v,
      native: e,
      toPdf: (clientX, clientY) => clientToPdf(clientX, clientY, v),
    }
  }

  /** Forgets the gesture and releases its pointer capture. */
  function dropGesture() {
    if (!gesture) return
    const id = gesture.pointerId
    gesture = null
    try {
      if (el?.hasPointerCapture?.(id)) el.releasePointerCapture(id)
    } catch {
      // Capture may already be gone (element detached).
    }
  }

  function onPointerDown(e: PointerEvent) {
    if (!tool || !vp || e.button !== 0 || gesture) return
    const pe = toPageEvent(e, vp)
    gesture = { pointerId: e.pointerId, tool, last: pe }
    el.setPointerCapture?.(e.pointerId)
    tool.onPointerDown?.(pe)
  }

  /** The gesture's handler and page event for `e`, if `e` belongs to the gesture. */
  function forGesture(e: PointerEvent): { t: ToolHandler; pe: PagePointerEvent } | null {
    if (!gesture || gesture.pointerId !== e.pointerId || !vp) return null
    if (gesture.tool !== tool) {
      dropGesture()
      return null
    }
    const pe = toPageEvent(e, vp)
    gesture.last = pe
    return { t: gesture.tool, pe }
  }

  function onPointerMove(e: PointerEvent) {
    const g = forGesture(e)
    g?.t.onPointerMove?.(g.pe)
  }

  function onPointerUp(e: PointerEvent) {
    const g = forGesture(e)
    if (!g) return
    dropGesture()
    g.t.onPointerUp?.(g.pe)
  }

  /** pointercancel, or capture lost without a preceding pointerup (up clears the gesture first). */
  function onPointerCancel(e: PointerEvent) {
    const g = forGesture(e)
    if (!g) return
    dropGesture()
    g.t.onPointerCancel?.(g.pe)
  }

  // A tool switch mid-stroke: the old handler is deactivated by the router;
  // drop the gesture at once so it cannot block the next press.
  $effect(() => {
    const current = tool // read first: it is this effect's only dependency
    if (gesture && gesture.tool !== current) dropGesture()
  })

  // Unmounted mid-stroke (page virtualised away, tab closed): cancel the stroke.
  onDestroy(() => {
    if (!gesture) return
    const { tool: t, last } = gesture
    dropGesture()
    if (t === tool) t.onPointerCancel?.(last)
  })
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
  onpointerup={onPointerUp}
  onpointercancel={onPointerCancel}
  onlostpointercapture={onPointerCancel}
  role="presentation"
  width="100%"
  height="100%"
  viewBox={vp ? `0 0 ${vp.width} ${vp.height}` : undefined}
  preserveAspectRatio="none"
>
  {#if vp}
    {#each annotations as a (a.id)}
      {#if !hidden?.has(a.id)}
        {@const K = annotationKinds.get(a.kind)}
        <K.Render {a} {vp} selected={false} />
      {/if}
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
