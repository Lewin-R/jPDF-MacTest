<script lang="ts">
  import { onDestroy } from 'svelte'
  import type { PageViewport } from 'pdfjs-dist'
  import type { PdfDoc } from './pdfEngine'
  import type { AnnotationStore } from '../session/store.svelte'
  import type { Annotation, Point } from '../session/model'
  import type { PagePointerEvent, TextEdit, ToolHandler } from '../registry/tools'
  import { annotationKinds } from '../registry/annotationKinds'
  import { pageHasText } from './textContent'
  import { clientToPdf as mapClientToPdf } from './viewerMath'
  import TextEditor from '../../annotations/freetext/Editor.svelte'
  import { handlePoint, handlesFor, toScreenRect } from '../../tools/select/handles'

  let {
    doc,
    pageNumber,
    scale,
    store,
    preview = null,
    hidden,
    tool = null,
    cursor,
    textEdit = null,
    selection = [],
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
    /**
     * Open text box editor on this page: a <textarea> stacked above the SVG
     * (a sibling, so its pointer input never reaches the tool).
     */
    textEdit?: TextEdit | null
    /** Selected annotation ids: outlined (with resize handles) when on this page. */
    selection?: readonly string[]
    /** Overrides the viewport derived from doc (tests). */
    viewport?: PageViewport
  } = $props()

  let loaded = $state<PageViewport | null>(null)
  const vp = $derived(viewport ?? loaded)
  /** Whether the page has selectable text; null until known. */
  let hasText = $state<boolean | null>(null)
  /**
   * A text-selecting tool (marker text mode) on a page that has, or may have,
   * text: pointer input goes through to the text layer underneath.
   */
  const textSelecting = $derived(!!tool?.textSelection?.() && hasText !== false)
  /** A tool that lets input through where nothing of its is under the pointer (select). */
  const hoverPassing = $derived(!!tool?.passThroughAt && hasText !== false)
  /** tool.passThroughAt at the last hover position (see onHover). */
  let passAt = $state(true)
  const passThrough = $derived(textSelecting || (hoverPassing && passAt))

  $effect(() => {
    if (viewport || !doc) return
    const s = scale
    let cancelled = false
    doc
      .getPage(pageNumber)
      .then(async (page) => {
        // getViewport applies the page's own rotation by default.
        if (!cancelled) loaded = page.getViewport({ scale: s })
        // Unreadable text content: treat as a page without text (freehand fallback).
        const text = await pageHasText(page).catch(() => false)
        if (!cancelled) hasText = text
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

  /** Screen box and handles of the selected annotation if it is drawn on this page (its preview while dragged). */
  const selected = $derived.by(() => {
    const id = selection[0]
    if (!vp || id === undefined) return null
    const a = preview?.id === id ? preview : hidden?.has(id) ? undefined : store.get(id)
    if (!a || a.page !== pageNumber - 1) return null
    return { rect: toScreenRect(annotationKinds.get(a.kind).bounds(a), vp), handles: handlesFor(a) }
  })

  let el: SVGSVGElement
  /**
   * Gesture in progress: its pointer, the handler that received its pointerdown
   * and its latest page event (used to cancel when no native event is available).
   */
  let gesture: { pointerId: number; tool: ToolHandler; last: PagePointerEvent } | null = null

  /** Client coordinates → PDF user space. */
  function clientToPdf(clientX: number, clientY: number, v: PageViewport): Point {
    return mapClientToPdf(clientX, clientY, el.getBoundingClientRect(), v)
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
    if (!tool || passThrough || !vp || e.button !== 0 || gesture) return
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
    passAt = true
  })

  /**
   * Hover pass-through: decides, before a press, whether it goes to the tool
   * or through to the text layer. Listens on the page (the overlay itself gets
   * no events while passing through); only while no button is pressed, so a
   * text selection dragged across an annotation keeps going.
   */
  function onHover(e: PointerEvent) {
    if (!tool?.passThroughAt || !vp || gesture || e.buttons !== 0) return
    passAt = tool.passThroughAt(toPageEvent(e, vp))
  }

  /** A press that went through to the text layer (not to the overlay or a text box editor). */
  function onPagePointerDown(e: PointerEvent) {
    if (!tool?.passThroughAt || !hoverPassing || !passAt || !vp || e.button !== 0) return
    const t = e.target
    if (t instanceof Node && el.contains(t)) return
    if (t instanceof HTMLElement && t.closest('textarea')) return
    const pe = toPageEvent(e, vp)
    tool.onPassThroughDown?.(pe)
    // No hover before the press (touch): the next press goes where this one was.
    passAt = tool.passThroughAt(pe)
  }

  $effect(() => {
    const page = el.parentElement
    if (!page) return
    page.addEventListener('pointermove', onHover)
    page.addEventListener('pointerdown', onPagePointerDown)
    return () => {
      page.removeEventListener('pointermove', onHover)
      page.removeEventListener('pointerdown', onPagePointerDown)
    }
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
  class:interactive={tool && !passThrough}
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
    {#if selected}
      {@const r = selected.rect}
      <g class="selection">
        <rect class="selection-box" x={r[0]} y={r[1]} width={r[2] - r[0]} height={r[3] - r[1]} />
        {#each selected.handles as h (h)}
          {@const [hx, hy] = handlePoint(r, h)}
          <rect class="handle" data-handle={h} x={hx - 4} y={hy - 4} width="8" height="8" />
        {/each}
      </g>
    {/if}
  {/if}
</svg>
{#if vp && textEdit}
  <TextEditor edit={textEdit} {vp} />
{/if}

<style>
  .overlay {
    position: absolute;
    inset: 0;
    overflow: hidden;
    /* Click-through unless a tool takes pointer input. */
    pointer-events: none;
  }
  .selection {
    pointer-events: none;
  }
  .selection-box {
    fill: none;
    stroke: var(--accent);
    stroke-width: 1;
  }
  .handle {
    fill: var(--bg);
    stroke: var(--accent);
    stroke-width: 1;
  }
  .interactive {
    pointer-events: auto;
    /* Pen and touch draw instead of scrolling. */
    touch-action: none;
  }
</style>
