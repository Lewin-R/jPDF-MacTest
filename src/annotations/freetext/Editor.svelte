<script lang="ts">
  import { onDestroy, onMount } from 'svelte'
  import type { PageViewport } from 'pdfjs-dist'
  import type { TextEdit } from '../../core/registry/tools'
  import { LINE_HEIGHT, TEXT_PADDING } from '../../core/geometry/textLayout'
  import { cssColor, FREETEXT_FONT, screenBox } from './screen'

  let { edit, vp }: { edit: TextEdit; vp: PageViewport } = $props()

  let el: HTMLTextAreaElement
  const a = $derived(edit.draft)
  const box = $derived(screenBox(a.rect, vp))
  const s = $derived(vp.scale)
  const background = $derived(
    a.background
      ? `rgba(${a.background.color.map((v) => Math.round(v * 255)).join(',')},${a.background.opacity})`
      : 'transparent',
  )

  /** Grows the textarea with its content (never below one line). */
  function grow() {
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }

  function onInput() {
    edit.setText(el.value)
    grow()
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      edit.commit()
      return
    }
    // Text editing chords stay in the textarea (native undo, select all);
    // other chords (Ctrl+S, …) reach the app, which commits first.
    const k = e.key.toLowerCase()
    if ((e.ctrlKey || e.metaKey) && !e.altKey && (k === 'z' || k === 'y' || k === 'a')) e.stopPropagation()
  }

  onMount(() => {
    el.value = a.text
    grow()
    el.focus({ preventScroll: true })
    el.setSelectionRange(el.value.length, el.value.length)
  })

  // Scrolled out of the virtualised page range: keep what was typed.
  onDestroy(() => edit.commit())
</script>

<textarea
  bind:this={el}
  class="freetext-editor"
  aria-label="Text box"
  spellcheck="false"
  rows="1"
  style:left="{box.left}px"
  style:top="{box.top}px"
  style:width="{box.width}px"
  style:min-height="{(a.fontSize * LINE_HEIGHT + 2 * TEXT_PADDING) * s}px"
  style:padding="{TEXT_PADDING * s}px"
  style:font-family={FREETEXT_FONT}
  style:font-size="{a.fontSize * s}px"
  style:color={cssColor(a.textColor)}
  style:background
  oninput={onInput}
  onkeydown={onKeydown}
  onblur={() => edit.commit()}
></textarea>

<style>
  .freetext-editor {
    position: absolute;
    box-sizing: border-box;
    margin: 0;
    border: none;
    outline: 1px dashed var(--accent);
    resize: none;
    overflow: hidden;
    line-height: 1.2;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    /* Typing, not drawing: no tool gestures from inside the box. */
    touch-action: auto;
    pointer-events: auto;
  }
</style>
