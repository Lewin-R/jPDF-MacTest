const BLOCKING =
  'input, textarea, select, summary, button, a[href], dialog, [contenteditable]:not([contenteditable="false"]), ' +
  '[role="dialog"], [aria-modal="true"], [role="button"], [role="menuitem"], [role="tab"], [role="switch"], ' +
  '[role="checkbox"], [role="radio"], [role="option"], [role="slider"]'

/** Whether Space belongs to `target` (text entry, activating a control, a modal) rather than to pan. */
export function isSpacePanBlocked(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(BLOCKING) !== null
}

/**
 * Buttons keep focus after a mouse click, which would hand Space to them from
 * then on. Drops that focus for pointer clicks (detail > 0); keyboard
 * activation (detail 0) and dialogs/menus keep theirs.
 */
export function blurAfterPointerClick(e: MouseEvent): void {
  if (e.detail === 0 || !(e.target instanceof Element)) return
  const b = e.target.closest('button, [role="tab"], [role="button"]')
  if (!(b instanceof HTMLElement) || b.closest('dialog, [role="dialog"], [aria-modal="true"], [role="menu"]')) return
  b.blur()
}
