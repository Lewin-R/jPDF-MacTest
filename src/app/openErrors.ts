import { isAppError, type AppErrorCode } from '../core/ipc/api'
import { fileNameOf } from '../core/session/session.svelte'

const MESSAGES: Partial<Record<AppErrorCode, string>> = {
  Encrypted: 'Encrypted PDFs are not supported yet',
  InvalidPdf: 'This file could not be opened as a PDF',
  NotFound: 'File not found',
  Locked: 'The file is locked by another program',
}

/** User-facing message for a failed open of `path`. */
export function openErrorMessage(e: unknown, path: string): string {
  return (isAppError(e) && MESSAGES[e.code]) || `Could not open ${fileNameOf(path)}`
}
