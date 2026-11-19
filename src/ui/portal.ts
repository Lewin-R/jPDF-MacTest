/**
 * Svelte action: moves the node to the end of `document.body` (back out on
 * destroy). For popups opened from inside a page: pages use `contain: strict`
 * for speed, which clips their content and makes them the containing block of
 * `position: fixed` descendants, so a popup left inside one is placed relative
 * to the page and cut off at its edge.
 */
export function portal(node: HTMLElement) {
  document.body.appendChild(node)
  return {
    destroy() {
      node.remove()
    },
  }
}
