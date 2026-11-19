import type { ClipboardImage } from '../core/ipc/clipboard'
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

/** Pasting the clipboard image onto the page ("Insert image"). */
export interface PageMenuPaste {
  /** The clipboard image read when the menu opened; null while unknown or when there is none. */
  image: ClipboardImage | null
  insert(image: ClipboardImage): void | Promise<void>
}

/**
 * Items of the page context menu (right-click with select, hand or the
 * text-selection marker) for `page` (1-based) of the document `actions`
 * belongs to. Each operation is one undo step. "Insert image" pastes the
 * clipboard image (`paste`); it is disabled while there is none.
 */
export function pageMenuItems(page: number, actions: PageMenuActions, paste?: PageMenuPaste): MenuItem[] {
  const i = page - 1
  /** Runs an operation; a failure is reported to the user, never thrown. */
  const attempt = (what: string, op: () => void | Promise<void>, failure = `Could not ${what} the page`) => () => {
    const fail = (e: unknown) => {
      console.error(`Could not ${what} page ${page}`, e)
      toasts.show(failure, 'error')
    }
    try {
      void Promise.resolve(op()).catch(fail)
    } catch (e) {
      fail(e)
    }
  }
  return [
    {
      label: 'Insert image',
      disabled: !paste?.image,
      run: attempt(
        'insert the image on',
        () => {
          if (paste?.image) return paste.insert(paste.image)
        },
        'Could not insert the image',
      ),
    },
    { label: `Insert empty page after page ${page}`, run: attempt('insert an empty page after', () => actions.insertBlankPage(i)) },
    { label: `Duplicate page ${page}`, run: attempt('duplicate', () => actions.duplicatePage(i)) },
    { label: 'Rotate right', run: attempt('rotate', () => actions.rotatePage(i, 90)) },
    { label: 'Rotate left', run: attempt('rotate', () => actions.rotatePage(i, -90)) },
    {
      label: `Delete page ${page}`,
      danger: true,
      disabled: !actions.canDeletePage(),
      run: attempt('delete', () => actions.deletePage(i)),
    },
  ]
}
