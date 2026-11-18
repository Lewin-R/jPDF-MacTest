<script lang="ts">
  import { onMount } from 'svelte'
  import type { ToolHandler } from '../registry/tools'
  import type { Annotation } from '../session/model'
  import type { DocumentSession } from '../session/session.svelte'
  import { clampScale, contentWidth, pageLeft, visibleRange } from './layout'
  import Overlay from './Overlay.svelte'
  import PageView from './PageView.svelte'
  import { wheelZoomFactor } from './viewerMath'

  // Mount one Viewer per session ({#key session.id}); scroll and scale live on
  // the session, so switching tabs restores them.
  let {
    session,
    tool = null,
    cursor,
    toolPreview = null,
  }: {
    session: DocumentSession
    /** Active tool's handler (see ToolRouter); page overlays forward pointer input to it. */
    tool?: ToolHandler | null
    cursor?: string
    /** The tool's live, uncommitted annotation, drawn on its page. */
    toolPreview?: Annotation | null
  } = $props()

  const WHEEL_COMMIT_MS = 150

  let el: HTMLDivElement

  // Live Ctrl+wheel / pinch preview: the committed layout is CSS-scaled by
  // preview.scale / session.scale around `origin` (content coordinates) until
  // the gesture pauses and the zoom is committed.
  let preview = $state<{ scale: number; origin: { x: number; y: number } } | null>(null)
  let wheelAnchor = { x: 0, y: 0 }
  let commitTimer: ReturnType<typeof setTimeout> | undefined

  const layout = $derived(session.layout)
  const width = $derived(contentWidth(layout, session.viewportW))
  const range = $derived(visibleRange(layout, session.scrollTop, session.viewportH, 1))
  const pages = $derived(
    Array.from({ length: Math.max(0, range.last - range.first + 1) }, (_, k) => range.first + k),
  )

  function onScroll() {
    session.setScroll(el.scrollTop, el.scrollLeft)
  }

  // Apply programmatic scroll changes (zoom, goToPage, tab restore) to the DOM.
  // Runs after the DOM update, so the content already has its new size.
  $effect(() => {
    const top = session.scrollTop
    const left = session.scrollLeft
    if (Math.abs(el.scrollTop - top) >= 1) el.scrollTop = top
    if (Math.abs(el.scrollLeft - left) >= 1) el.scrollLeft = left
    // The browser clamps out-of-range positions without always firing a scroll event.
    if (Math.abs(el.scrollTop - top) >= 1 || Math.abs(el.scrollLeft - left) >= 1) {
      session.setScroll(el.scrollTop, el.scrollLeft)
    }
  })

  function onWheel(e: WheelEvent) {
    // Touchpad pinch arrives as Ctrl+wheel too.
    if (!e.ctrlKey) return
    e.preventDefault()
    if (!preview) {
      const r = el.getBoundingClientRect()
      wheelAnchor = { x: e.clientX - r.left, y: e.clientY - r.top }
      preview = {
        scale: session.scale,
        origin: { x: el.scrollLeft + wheelAnchor.x, y: el.scrollTop + wheelAnchor.y },
      }
    }
    preview.scale = clampScale(preview.scale * wheelZoomFactor(e.deltaY, e.deltaMode))
    clearTimeout(commitTimer)
    commitTimer = setTimeout(commitWheelZoom, WHEEL_COMMIT_MS)
  }

  function commitWheelZoom() {
    clearTimeout(commitTimer)
    if (!preview) return
    const scale = preview.scale
    preview = null
    session.zoomTo(scale, wheelAnchor)
  }

  onMount(() => {
    const measure = () => {
      session.setViewport(el.clientWidth, el.clientHeight)
      // Fit width needs a real viewport; layout may not have settled on mount.
      if (el.clientWidth > 0 && el.clientHeight > 0) session.initView()
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    // Non-passive so preventDefault stops WebView2 from zooming the whole UI.
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      ro.disconnect()
      el.removeEventListener('wheel', onWheel)
      commitWheelZoom()
    }
  })
</script>

<div class="viewer" bind:this={el} onscroll={onScroll}>
  <div class="content" style:width="{width}px" style:height="{layout.totalHeight}px">
    <div
      class="pages"
      class:previewing={preview}
      style:transform={preview ? `scale(${preview.scale / session.scale})` : undefined}
      style:transform-origin={preview ? `${preview.origin.x}px ${preview.origin.y}px` : undefined}
    >
      {#each pages as i (i)}
        <PageView
          doc={session.doc}
          cacheId={session.id}
          pageNumber={i + 1}
          pageSize={session.pageSizes[i]}
          scale={session.scale}
          left={pageLeft(layout, i, session.viewportW)}
          top={layout.tops[i]}
        >
          <Overlay
            doc={session.doc}
            pageNumber={i + 1}
            scale={session.scale}
            store={session.store}
            preview={toolPreview?.page === i ? toolPreview : null}
            {tool}
            {cursor}
          />
        </PageView>
      {/each}
    </div>
  </div>
</div>

<style>
  .viewer {
    height: 100%;
    overflow: auto;
    /* Keep clientWidth stable whether or not the vertical scrollbar shows. */
    scrollbar-gutter: stable;
    background: var(--bg);
  }
  .content {
    position: relative;
    /* A CSS-scaled preview must not grow the scrollable area. */
    overflow: clip;
  }
  .pages {
    position: absolute;
    inset: 0;
  }
  .previewing {
    will-change: transform;
  }
</style>
