<script lang="ts">
  import type { Snippet } from 'svelte'
  import { AnnotationMode, type RenderTask } from 'pdfjs-dist'
  import type { PdfDoc } from './pdfEngine'
  import { renderCache } from './renderCache'
  import { renderScale } from './viewerMath'

  let {
    doc,
    cacheId,
    pageNumber,
    pageSize,
    scale,
    left,
    top,
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
    /** Later layers (text layer, annotation overlay) stacked above the canvas. */
    children?: Snippet
  } = $props()

  let canvas: HTMLCanvasElement

  function show(src: CanvasImageSource, w: number, h: number) {
    // Resizing clears the canvas, so draw in the same task: no blank frame.
    canvas.width = w
    canvas.height = h
    canvas.getContext('2d')!.drawImage(src, 0, 0)
  }

  $effect(() => {
    const rs = renderScale(pageSize.width, pageSize.height, scale, window.devicePixelRatio || 1)
    const key = `${cacheId}:${pageNumber}@${rs}`
    const cached = renderCache.get(key)
    if (cached) {
      show(cached, cached.width, cached.height)
      return
    }

    let cancelled = false
    let task: RenderTask | null = null
    void (async () => {
      const page = await doc.getPage(pageNumber)
      if (cancelled) return
      const viewport = page.getViewport({ scale: rs })
      // Render off-screen so the previous (CSS-scaled) bitmap stays visible meanwhile.
      const off = document.createElement('canvas')
      off.width = Math.floor(viewport.width)
      off.height = Math.floor(viewport.height)
      // ENABLE_STORAGE: annotations the session manages are suppressed (noView).
      task = page.render({ canvas: off, viewport, annotationMode: AnnotationMode.ENABLE_STORAGE })
      await task.promise
      if (cancelled) return
      const bmp = await createImageBitmap(off)
      if (cancelled) {
        bmp.close()
        return
      }
      renderCache.set(key, bmp)
      show(bmp, bmp.width, bmp.height)
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
  class="page"
  style:left="{left}px"
  style:top="{top}px"
  style:width="{pageSize.width * scale}px"
  style:height="{pageSize.height * scale}px"
>
  <canvas bind:this={canvas}></canvas>
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
  canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }
</style>
