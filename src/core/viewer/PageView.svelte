<script lang="ts">
  import { onDestroy, type Snippet } from 'svelte'
  import { AnnotationMode, type RenderTask } from 'pdfjs-dist'
  import type { RGB } from '../session/model'
  import type { PdfDoc } from './pdfEngine'
  import TextLayer from './TextLayer.svelte'
  import { releaseCanvas, renderCache } from './renderCache'
  import { renderScale } from './viewerMath'

  let {
    doc,
    cacheId,
    pageNumber,
    pageSize,
    scale,
    left,
    top,
    selectionColor = null,
    children,
  }: {
    doc: PdfDoc
    /** Render-cache namespace (the session id). */
    cacheId: string
    /** 1-based, as PdfDoc.getPage expects. */
    pageNumber: number
    /** Page size at scale 1, in points. */
    pageSize: { width: number; height: number }
    scale: number
    left: number
    top: number
    /** Tints text selection in the text layer (marker text mode); null = default. */
    selectionColor?: RGB | null
    /** Later layers (annotation overlay) stacked above the canvas and text layer. */
    children?: Snippet
  } = $props()

  let pageEl: HTMLDivElement
  /**
   * The canvas on screen: the one pdf.js rendered into, shared with the render
   * cache (no copy). Inserted as the page's first child, under the layers.
   */
  let shown: HTMLCanvasElement | null = null
  /** Bumped when the shown canvas lost its pixels (GPU reset): render again. */
  let contextResets = $state(0)

  // Re-render when the display scale changes (window moved to another monitor,
  // Windows scaling changed): the media query matches the current ratio only.
  let dpr = $state(window.devicePixelRatio || 1)
  $effect(() => {
    if (typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia(`(resolution: ${dpr}dppx)`)
    const onChange = () => (dpr = window.devicePixelRatio || 1)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  })

  onDestroy(() => {
    // A cached canvas stays for scrolling back; the cache frees it on eviction.
    if (shown && !renderCache.holds(shown)) {
      shown.width = 0
      shown.height = 0
    }
    // Off screen: free pdf.js' decoded fonts, images and operator lists of the
    // page (pdf.js defers this until a still-running render has finished).
    doc
      .getPage(pageNumber)
      .then((page) => {
        if (!doc.destroyed) page.cleanup()
      })
      .catch(() => {})
  })

  /** Swaps `c` in for the canvas on screen in one step: no blank frame. */
  function show(c: HTMLCanvasElement) {
    const old = shown
    if (old === c) return
    shown = c
    if (old) old.replaceWith(c)
    else pageEl.prepend(c)
    if (old && !renderCache.holds(old)) releaseCanvas(old)
  }

  $effect(() => {
    void contextResets
    const rs = renderScale(pageSize.width, pageSize.height, scale, dpr)
    const key = `${cacheId}:${pageNumber}@${rs}`
    const cached = renderCache.get(key)
    if (cached) {
      show(cached)
      return
    }

    let cancelled = false
    let task: RenderTask | null = null
    void (async () => {
      const page = await doc.getPage(pageNumber)
      if (cancelled) return
      const viewport = page.getViewport({ scale: rs })
      // Render off-screen so the previous (CSS-scaled) canvas stays visible meanwhile.
      const off = document.createElement('canvas')
      off.width = Math.floor(viewport.width)
      off.height = Math.floor(viewport.height)
      // A GPU canvas comes back blank after a GPU reset.
      off.addEventListener('contextrestored', () => {
        renderCache.evict(off)
        if (shown === off) contextResets++
      })
      try {
        // ENABLE_STORAGE: annotations the session manages are suppressed (noView).
        task = page.render({ canvas: off, viewport, annotationMode: AnnotationMode.ENABLE_STORAGE })
        await task.promise
      } catch (e) {
        releaseCanvas(off)
        throw e
      }
      if (cancelled) {
        releaseCanvas(off)
        return
      }
      // Shown first: the cache never frees a canvas that is on screen.
      show(off)
      renderCache.set(key, off)
    })().catch((e: unknown) => {
      // Cancelled renders and renders of a closed tab's doc reject by design.
      if (!cancelled && !doc.destroyed) console.error(`Failed to render page ${pageNumber}`, e)
    })

    return () => {
      cancelled = true
      task?.cancel()
    }
  })
</script>

<div
  bind:this={pageEl}
  class="page"
  style:left="{left}px"
  style:top="{top}px"
  style:width="{pageSize.width * scale}px"
  style:height="{pageSize.height * scale}px"
>
  <TextLayer {doc} {pageNumber} {scale} {selectionColor} />
  {@render children?.()}
</div>

<style>
  .page {
    position: absolute;
    overflow: hidden;
    background: var(--page-bg);
    box-shadow: var(--page-shadow);
    contain: strict;
  }
  .page > :global(canvas) {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }
</style>
