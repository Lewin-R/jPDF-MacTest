import { toolRegistry } from '../core/registry/tools'
import { eraserTool } from './eraser'
import { handTool } from './hand'
import { markerTool } from './marker'
import { penTool } from './pen'

toolRegistry.register(penTool)
toolRegistry.register(handTool)
toolRegistry.register(eraserTool)
toolRegistry.register(markerTool)
