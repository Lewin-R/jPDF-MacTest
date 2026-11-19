import type { PDFPageProxy } from 'pdfjs-dist'

export type TextContent = Awaited<ReturnType<PDFPageProxy['getTextContent']>>

const cache = new WeakMap<PDFPageProxy, Promise<TextContent>>()

/** The page's text content, fetched once per page (failed fetches are retried next time). */
export function textContentOf(page: PDFPageProxy): Promise<TextContent> {
  let p = cache.get(page)
  if (!p) {
    p = page.getTextContent()
    cache.set(page, p)
    p.catch(() => cache.delete(page))
  }
  return p
}

/** Whether any text item has a non-whitespace string (false for scanned pages). Cached per page. */
export async function pageHasText(page: PDFPageProxy): Promise<boolean> {
  const { items } = await textContentOf(page)
  return items.some((i) => 'str' in i && i.str.trim() !== '')
}
