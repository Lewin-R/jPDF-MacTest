import { AnnotationMode } from 'pdfjs-dist'
import { isAppError, openPdf, type AppErrorCode } from '../../core/ipc/api'
import { fileNameOf } from '../../core/session/session.svelte'
import { loadPdf } from '../../core/viewer/pdfEngine'
import { releaseCanvas } from '../../core/viewer/renderCache'
import { moveItem, type MergeItem } from './mergeList'

export interface MergeEntry extends MergeItem {
  /** Page 1, small (null until read, or when it could not be drawn). */
  thumb: HTMLCanvasElement | null
}

export interface PdfInfo {
  pages: number
  thumb: HTMLCanvasElement | null
}

/** Reads a file's page count and a page-1 thumbnail `px` device pixels on its longest side. */
export type PdfInfoReader = (path: string, px: number) => Promise<PdfInfo>

/** Thumbnail size (CSS px, longest side) of a merge row. */
export const THUMB_BOX = 44

/** Files read at a time: each one is loaded whole into the pdf.js worker. */
const CONCURRENCY = 2

const ROW_ERRORS: Partial<Record<AppErrorCode, string>> = {
  Encrypted: 'Password-protected',
  InvalidPdf: 'Not a readable PDF',
  NotFound: 'File not found',
  Locked: 'In use by another program',
}

export function rowError(e: unknown): string {
  return (isAppError(e) && ROW_ERRORS[e.code]) || 'Could not be read'
}

/**
 * The merge page's files. Each added file is opened once with pdf.js for its
 * page count and a tiny page-1 render, then closed again: a long list holds
 * nothing but small canvases.
 */
export class MergeFiles {
  items: readonly MergeEntry[] = $state.raw([])
  private seq = 0
  private queue: MergeEntry[] = []
  private active = 0
  private disposed = false

  constructor(
    paths: readonly string[] = [],
    private readonly read: PdfInfoReader = readPdfInfo,
    private readonly px = Math.ceil(THUMB_BOX * (globalThis.devicePixelRatio || 1)),
  ) {
    this.add(paths)
  }

  /** Appends the files (in order); they are read in the background. */
  add(paths: readonly string[]): void {
    const added = paths.map((path) => ({
      id: ++this.seq, path, name: fileNameOf(path), pages: null, error: null, thumb: null,
    }))
    if (added.length === 0) return
    this.items = [...this.items, ...added]
    this.queue.push(...added)
    this.pump()
  }

  remove(id: number): void {
    const gone = this.items.find((i) => i.id === id)
    if (!gone) return
    this.items = this.items.filter((i) => i.id !== id)
    this.queue = this.queue.filter((i) => i.id !== id)
    if (gone.thumb) releaseCanvas(gone.thumb)
  }

  move(from: number, to: number): void {
    this.items = moveItem(this.items, from, to)
  }

  /** Stops reading and frees the thumbnails. */
  dispose(): void {
    this.disposed = true
    this.queue = []
    for (const i of this.items) if (i.thumb) releaseCanvas(i.thumb)
  }

  private pump(): void {
    while (!this.disposed && this.active < CONCURRENCY && this.queue.length > 0) {
      const entry = this.queue.shift()!
      this.active++
      void this.load(entry).finally(() => {
        this.active--
        this.pump()
      })
    }
  }

  private async load(entry: MergeEntry): Promise<void> {
    let patch: Partial<MergeEntry>
    try {
      const info = await this.read(entry.path, this.px)
      patch = { pages: info.pages, thumb: info.thumb }
    } catch (e) {
      if (!isAppError(e) || e.code === 'Io') console.error(`Could not read ${entry.path} for merging`, e)
      patch = { error: rowError(e) }
    }
    const listed = this.items.some((i) => i.id === entry.id)
    if (this.disposed || !listed) {
      // Removed (or the page closed) while reading.
      if (patch.thumb) releaseCanvas(patch.thumb)
      return
    }
    this.items = this.items.map((i) => (i.id === entry.id ? { ...i, ...patch } : i))
  }
}

/** The default reader: pdf.js, closed again right after page 1 is drawn. */
export async function readPdfInfo(path: string, px: number): Promise<PdfInfo> {
  const doc = await loadPdf(await openPdf(path))
  try {
    const page = await doc.getPage(1)
    const unit = page.getViewport({ scale: 1 })
    const viewport = page.getViewport({ scale: px / Math.max(unit.width, unit.height) })
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(viewport.width))
    canvas.height = Math.max(1, Math.round(viewport.height))
    let thumb: HTMLCanvasElement | null = canvas
    try {
      await page.render({ canvas, viewport, annotationMode: AnnotationMode.ENABLE }).promise
    } catch (e) {
      // The page count is what matters; a row without a picture still merges.
      console.error(`Could not draw page 1 of ${path}`, e)
      releaseCanvas(canvas)
      thumb = null
    }
    return { pages: doc.numPages, thumb }
  } finally {
    void doc.destroy()
  }
}
