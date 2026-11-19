import type { MenuItem } from '../ui/ContextMenu.svelte'
import { toasts } from '../ui/toasts.svelte'

/** The page operations of a document (DocumentSession); pages are 0-based. */
export interface PageMenuActions {
  duplicatePage(i: number): void
  deletePage(i: number): void
  insertBlankPage(i: number): Promise<void>
  rotatePage(i: number, delta: 90 | -90): Promise<void>
  canDeletePage(): boolean
}

/**
 * Items of the page context menu (right-click with select, hand or the
 * text-selection marker) for `page` (1-based) of the document `actions`
 * belongs to. Each operation is one undo step. "Insert as…" is a placeholder.
 */
export function pageMenuItems(page: number, actions: PageMenuActions): MenuItem[] {
  const i = page - 1
  /** Runs an operation; a failure is reported to the user, never thrown. */
  const attempt = (what: string, op: () => void | Promise<void>) => () => {
    const fail = (e: unknown) => {
      console.error(`Could not ${what} page ${page}`, e)
      toasts.show(`Could not ${what} the page`, 'error')
    }
    try {
      void Promise.resolve(op()).catch(fail)
    } catch (e) {
      fail(e)
    }
  }
  return [
    { label: 'Insert as…', run: () => {} },
    { label: `Duplicate page ${page}`, run: attempt('duplicate', () => actions.duplicatePage(i)) },
    {
      label: `Delete page ${page}`,
      danger: true,
      disabled: !actions.canDeletePage(),
      run: attempt('delete', () => actions.deletePage(i)),
    },
    { label: `Insert empty page after page ${page}`, run: attempt('insert an empty page after', () => actions.insertBlankPage(i)) },
    { label: `Rotate page ${page} right`, run: attempt('rotate', () => actions.rotatePage(i, 90)) },
    { label: `Rotate page ${page} left`, run: attempt('rotate', () => actions.rotatePage(i, -90)) },
  ]
}
