import type { Point, Rect } from '../session/model'

/** Inner padding of a text box, line height factor and default box width (pt). */
export const TEXT_PADDING = 4, LINE_HEIGHT = 1.2, DEFAULT_BOX_WIDTH = 200
/** First baseline below the top padding, as a fraction of the font size (same in the saved appearance). */
export const ASCENT = 0.8

/**
 * Helvetica advance widths (AFM, 1/1000 em) by code point: ASCII 0x20–0x7E,
 * Latin-1 0xA0–0xFF and the WinAnsi specials. Saved boxes are drawn with
 * Helvetica, so wrapping with these widths matches what viewers lay out.
 */
const WIDTHS = new Map<number, number>()
const ASCII = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, // ' '..'/'
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, // '0'..'?'
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, // '@'..'O'
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, // 'P'..'_'
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, // '`'..'o'
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584, // 'p'..'~'
]
const LATIN1 = [
  278, 333, 556, 556, 556, 556, 260, 556, 333, 737, 370, 556, 584, 333, 737, 333, // 0xA0..0xAF
  400, 584, 333, 333, 333, 556, 537, 278, 333, 333, 365, 556, 834, 834, 834, 611, // 0xB0..0xBF
  667, 667, 667, 667, 667, 667, 1000, 722, 667, 667, 667, 667, 278, 278, 278, 278, // 0xC0..0xCF
  722, 722, 778, 778, 778, 778, 778, 584, 778, 722, 722, 722, 722, 667, 667, 611, // 0xD0..0xDF
  556, 556, 556, 556, 556, 556, 889, 500, 556, 556, 556, 556, 278, 278, 278, 278, // 0xE0..0xEF
  556, 556, 556, 556, 556, 556, 556, 584, 611, 556, 556, 556, 556, 500, 556, 500, // 0xF0..0xFF
]
const SPECIALS: [string, number][] = [
  ['€', 556], ['‚', 222], ['ƒ', 556], ['„', 333], ['…', 1000], ['†', 556], ['‡', 556], ['ˆ', 333],
  ['‰', 1000], ['Š', 667], ['‹', 333], ['Œ', 1000], ['Ž', 611], ['‘', 222], ['’', 222], ['“', 333],
  ['”', 333], ['•', 350], ['–', 556], ['—', 1000], ['˜', 333], ['™', 1000], ['š', 500], ['›', 333],
  ['œ', 944], ['ž', 500], ['Ÿ', 667],
]
ASCII.forEach((w, i) => WIDTHS.set(0x20 + i, w))
LATIN1.forEach((w, i) => WIDTHS.set(0xa0 + i, w))
for (const [c, w] of SPECIALS) WIDTHS.set(c.codePointAt(0)!, w)
/** Width of characters WinAnsi cannot encode: they are saved as '?' (556). */
const UNKNOWN_WIDTH = 556

/** Width of `s` in Helvetica at `size` pt (AFM metrics; deterministic, no canvas). */
export function measureHelvetica(s: string, size: number): number {
  let units = 0
  for (const ch of s) units += WIDTHS.get(ch.codePointAt(0)!) ?? UNKNOWN_WIDTH
  return (units * size) / 1000
}

/** Splits a word wider than maxWidth into pieces that fit (at least one character each). */
function breakWord(word: string, fontSize: number, maxWidth: number, measure: (s: string, size: number) => number): string[] {
  const out: string[] = []
  let cur = ''
  for (const ch of word) {
    if (cur !== '' && measure(cur + ch, fontSize) > maxWidth) {
      out.push(cur)
      cur = ''
    }
    cur += ch
  }
  if (cur !== '') out.push(cur)
  return out
}

/**
 * Lines of `text` for a box whose text area is `maxWidth` wide: hard breaks
 * at '\n', then greedy word wrap at spaces; words longer than maxWidth are
 * broken by character. Spaces inside a line are kept.
 */
export function wrapText(
  text: string,
  fontSize: number,
  maxWidth: number,
  measure: (s: string, size: number) => number,
): string[] {
  const lines: string[] = []
  for (const paragraph of text.replace(/\r\n?/g, '\n').split('\n')) {
    let line: string | null = null
    for (const word of paragraph.split(' ')) {
      const candidate: string = line === null ? word : `${line} ${word}`
      if (measure(candidate, fontSize) <= maxWidth) {
        line = candidate
        continue
      }
      if (line !== null) lines.push(line)
      if (measure(word, fontSize) <= maxWidth) {
        line = word
      } else {
        const pieces = breakWord(word, fontSize, maxWidth, measure)
        lines.push(...pieces.slice(0, -1))
        line = pieces.at(-1) ?? ''
      }
    }
    lines.push(line ?? '')
  }
  return lines
}

/** Height of a box holding `lines` lines (at least one). */
export function boxHeight(lines: number, fontSize: number): number {
  return Math.max(1, lines) * fontSize * LINE_HEIGHT + 2 * TEXT_PADDING
}

/** Box with its top-left corner at `origin` (PDF, y up): height = lines*fontSize*LINE_HEIGHT + 2*TEXT_PADDING. */
export function boxRect(origin: Point, width: number, lines: number, fontSize: number): Rect {
  const h = lines * fontSize * LINE_HEIGHT + 2 * TEXT_PADDING
  return [origin[0], origin[1] - h, origin[0] + width, origin[1]]
}

/** Page rotation normalised to 0, 90, 180 or 270 (anything else counts as 0). */
export function normalizeRotation(rotation: number | undefined): 0 | 90 | 180 | 270 {
  const r = (((rotation ?? 0) % 360) + 360) % 360
  return r === 90 || r === 180 || r === 270 ? r : 0
}

/**
 * The PDF rect of a box that is `width` x `height` on screen with its
 * top-left (on screen) at `origin`, on a page with this /Rotate. The rect
 * stays axis-aligned in PDF space; for 90/270 its PDF width is the box height.
 */
export function pageBoxRect(origin: Point, width: number, height: number, rotation: number): Rect {
  const [x, y] = origin
  switch (normalizeRotation(rotation)) {
    case 90: // screen right = +y, down = +x
      return [x, y, x + height, y + width]
    case 180: // right = -x, down = +y
      return [x - width, y, x, y + height]
    case 270: // right = -y, down = -x
      return [x - height, y - width, x, y]
    default:
      return [x, y - height, x + width, y]
  }
}

/** Screen-aligned size of a box rect on a page with this /Rotate. */
export function frameSize(rect: Rect, rotation: number): { width: number; height: number } {
  const w = rect[2] - rect[0]
  const h = rect[3] - rect[1]
  const r = normalizeRotation(rotation)
  return r === 90 || r === 270 ? { width: h, height: w } : { width: w, height: h }
}

/** PDF point at the box's top-left corner on screen (the `origin` of pageBoxRect). */
export function frameOrigin(rect: Rect, rotation: number): Point {
  switch (normalizeRotation(rotation)) {
    case 90:
      return [rect[0], rect[1]]
    case 180:
      return [rect[2], rect[1]]
    case 270:
      return [rect[2], rect[3]]
    default:
      return [rect[0], rect[3]]
  }
}

/** Lines of a text box: `text` wrapped to the box's screen width minus padding, with Helvetica metrics. */
export function layoutLines(text: string, fontSize: number, frameWidth: number): string[] {
  return wrapText(text, fontSize, frameWidth - 2 * TEXT_PADDING, measureHelvetica)
}
