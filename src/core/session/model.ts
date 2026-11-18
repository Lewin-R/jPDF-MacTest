// Identical JSON shape to Rust AnnotationDto.
export type RGB = [number, number, number];           // 0..1
export type Point = [number, number];                 // PDF user space
export type Rect = [number, number, number, number];  // x1, y1, x2, y2 (PDF, y up)
export type Quad = [number, number, number, number, number, number, number, number]; // PDF QuadPoints order: TL, TR, BL, BR

interface Base { id: string; page: number; sourceRef: string | null; modifiedAt: string; author: string }
export interface HighlightAnnotation extends Base { kind: 'highlight'; quads: Quad[]; color: RGB; opacity: number }
export interface InkAnnotation extends Base { kind: 'ink'; strokes: Point[][]; color: RGB; width: number; opacity: number; blend: 'normal' | 'multiply'; role: 'pen' | 'marker' }
export interface FreeTextAnnotation extends Base { kind: 'freetext'; rect: Rect; text: string; lines: string[]; fontSize: number; textColor: RGB; background: { color: RGB; opacity: number } | null }
export type Annotation = HighlightAnnotation | InkAnnotation | FreeTextAnnotation;

/** `page` is 0-based here (session.currentPage / goToPage are 1-based). */
export function newId(): string {
  return crypto.randomUUID()
}
