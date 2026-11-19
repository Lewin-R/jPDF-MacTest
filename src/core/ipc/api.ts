import type { DeletedRef } from '../session/store.svelte'
import { invoke } from '@tauri-apps/api/core'
import type { Annotation } from '../session/model'

export type AppErrorCode =
  | 'NotFound'
  | 'Locked'
  | 'ReadOnly'
  | 'Encrypted'
  | 'InvalidPdf'
  | 'Io'

export interface AppError {
  code: AppErrorCode
  message: string
}

const CODES: readonly string[] = ['NotFound', 'Locked', 'ReadOnly', 'Encrypted', 'InvalidPdf', 'Io']

export function isAppError(e: unknown): e is AppError {
  if (typeof e !== 'object' || e === null) return false
  const o = e as Record<string, unknown>
  return typeof o.code === 'string' && CODES.includes(o.code) && typeof o.message === 'string'
}

export function openPdf(path: string): Promise<ArrayBuffer> {
  return invoke<ArrayBuffer>('open_pdf', { path })
}

export function readAnnotations(path: string): Promise<Annotation[]> {
  return invoke<Annotation[]>('read_annotations', { path })
}

/** Writes `upserts`/`deletes` as an incremental update of `sourcePath` to `targetPath`; `refs` maps annotation id -> sourceRef. */
export function savePdf(
  sourcePath: string,
  targetPath: string,
  upserts: Annotation[],
  deletes: DeletedRef[],
): Promise<{ refs: Record<string, string> }> {
  return invoke<{ refs: Record<string, string> }>('save_pdf', { sourcePath, targetPath, upserts, deletes })
}

/** Whether a file exists at `path` (true when that cannot be determined). */
export function pathExists(path: string): Promise<boolean> {
  return invoke<boolean>('path_exists', { path })
}

export function getLaunchFiles(): Promise<string[]> {
  return invoke<string[]>('get_launch_files')
}

export function loadSettings(): Promise<unknown | null> {
  return invoke<unknown | null>('load_settings')
}

export function saveSettings(value: unknown): Promise<void> {
  return invoke<void>('save_settings', { value })
}
