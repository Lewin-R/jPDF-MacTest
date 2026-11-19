import { afterEach, describe, expect, it } from 'vitest'
import { guardPageZoom } from '../../src/app/pageZoomGuard'

function wheel(target: EventTarget, ctrlKey: boolean): WheelEvent {
  const e = new WheelEvent('wheel', { ctrlKey, deltaY: -10, bubbles: true, cancelable: true })
  target.dispatchEvent(e)
  return e
}

let dispose: (() => void) | null = null
afterEach(() => {
  dispose?.()
  dispose = null
  document.body.innerHTML = ''
})

describe('guardPageZoom', () => {
  it('cancels Ctrl+wheel (touchpad pinch) anywhere so the WebView never zooms the whole UI', () => {
    dispose = guardPageZoom(window)
    const toolbar = document.body.appendChild(document.createElement('div'))
    expect(wheel(toolbar, true).defaultPrevented).toBe(true)
  })

  it('leaves normal wheel scrolling alone', () => {
    dispose = guardPageZoom(window)
    const el = document.body.appendChild(document.createElement('div'))
    expect(wheel(el, false).defaultPrevented).toBe(false)
  })

  it('stops guarding once disposed', () => {
    guardPageZoom(window)()
    const el = document.body.appendChild(document.createElement('div'))
    expect(wheel(el, true).defaultPrevented).toBe(false)
  })
})
