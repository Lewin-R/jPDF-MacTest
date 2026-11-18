import { describe, expect, it } from 'vitest'
import { blurAfterPointerClick, isSpacePanBlocked } from '../../../src/core/viewer/spacePan'

function html(h: string): HTMLElement {
  const d = document.createElement('div')
  d.innerHTML = h
  document.body.append(d)
  return d
}

describe('isSpacePanBlocked', () => {
  it('blocks text entry, controls and modals', () => {
    const d = html(
      '<input id=i><textarea id=t></textarea><button id=b><span id=bs></span></button><a href="#" id=a></a>' +
        '<div role=tab id=tab></div><div role=menuitem id=m></div><div contenteditable id=c></div>' +
        '<div role=dialog><p id=dp></p></div>',
    )
    for (const id of ['i', 't', 'b', 'bs', 'a', 'tab', 'm', 'c', 'dp']) {
      expect(isSpacePanBlocked(d.querySelector('#' + id)), id).toBe(true)
    }
  })
  it('allows body, plain elements and the viewer', () => {
    const d = html('<div id=v><svg id=s></svg></div><a id=noref></a>')
    expect(isSpacePanBlocked(document.body)).toBe(false)
    expect(isSpacePanBlocked(d.querySelector('#s'))).toBe(false)
    expect(isSpacePanBlocked(d.querySelector('#noref'))).toBe(false)
    expect(isSpacePanBlocked(null)).toBe(false)
  })
})

describe('blurAfterPointerClick', () => {
  it('blurs on mouse click but not on keyboard activation', () => {
    const d = html('<button id=b></button>')
    const b = d.querySelector('button')!
    b.focus()
    const key = new MouseEvent('click', { detail: 0 })
    Object.defineProperty(key, 'target', { value: b })
    blurAfterPointerClick(key)
    expect(document.activeElement).toBe(b)
    const mouse = new MouseEvent('click', { detail: 1 })
    Object.defineProperty(mouse, 'target', { value: b })
    blurAfterPointerClick(mouse)
    expect(document.activeElement).not.toBe(b)
  })
})
