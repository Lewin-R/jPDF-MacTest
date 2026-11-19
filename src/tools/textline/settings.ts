import type { RGB } from '../../core/session/model'

export interface TextLineSettings {
  color: RGB
}

export const TEXT_LINE_PRESETS: RGB[] = [
  [0.898, 0.224, 0.208], // #E53935
  [0.118, 0.533, 0.898], // #1E88E5
  [0.263, 0.627, 0.278], // #43A047
  [0, 0, 0], // #000000
  [1, 0.596, 0], // #FF9800
  [0.557, 0.141, 0.667], // #8E24AA
]
