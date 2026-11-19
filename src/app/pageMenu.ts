import type { MenuItem } from '../ui/ContextMenu.svelte'

/**
 * Items of the page context menu (right-click with select, hand or the
 * text-selection marker) for `page` (1-based). The actions are placeholders
 * for now: choosing one only closes the menu.
 */
export function pageMenuItems(page: number): MenuItem[] {
  const placeholder = () => {}
  return [
    { label: 'Insert as…', run: placeholder },
    { label: `Duplicate page ${page}`, run: placeholder },
    { label: `Delete page ${page}`, danger: true, run: placeholder },
    { label: `Insert empty page after page ${page}`, run: placeholder },
    { label: 'Rotate right', run: placeholder },
    { label: 'Rotate left', run: placeholder },
  ]
}
