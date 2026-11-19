import type { RGB } from '../../core/session/model'

export interface TextSettings {
  textColor: RGB
  fontSize: number
  background: { color: RGB; opacity: number } | null
}

/** Background colour picked when switching from Transparent to Colour. */
export const DEFAULT_BACKGROUND: { color: RGB; opacity: number } = { color: [1, 1, 1], opacity: 1 }

export const BACKGROUND_PRESETS: RGB[] = [
  [1, 1, 1], // #FFFFFF
  [1, 0.922, 0.231], // #FFEB3B
  [0.463, 1, 0.012], // #76FF03
  [0.094, 1, 1], // #18FFFF
  [1, 0.251, 0.506], // #FF4081
  [0, 0, 0], // #000000
]
