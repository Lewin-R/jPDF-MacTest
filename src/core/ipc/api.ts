import { invoke } from '@tauri-apps/api/core'

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

export function getLaunchFiles(): Promise<string[]> {
  return invoke<string[]>('get_launch_files')
}
