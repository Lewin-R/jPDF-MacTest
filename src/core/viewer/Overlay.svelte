<script lang="ts">
  import type { PageViewport } from 'pdfjs-dist'
  import type { PdfDoc } from './pdfEngine'
  import type { AnnotationStore } from '../session/store.svelte'
  import type { Annotation } from '../session/model'
  import { annotationKinds } from '../registry/annotationKinds'

  let {
    doc,
    pageNumber,
    scale,
    store,
    preview = null,
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
      .catch(() => {})
    return () => {
      cancelled = true
    }
  })

  const annotations = $derived(store.byPage(pageNumber - 1))
</script>

<!-- Same CSS box as the canvas, so it scales with it during the zoom preview. -->
<svg class="overlay" width="100%" height="100%">
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
    /* Interaction is wired up with the tools. */
    pointer-events: none;
  }
</style>
