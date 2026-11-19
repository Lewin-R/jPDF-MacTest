import { annotationKinds } from '../core/registry/annotationKinds'
import { freetextKind } from './freetext'
import { highlightKind } from './highlight'
import { imageKind } from './image'
import { inkKind } from './ink'
import { lineKind } from './line'
import { shapeKind } from './shape'
import { strikeoutKind, underlineKind } from './textline'

annotationKinds.register(highlightKind)
annotationKinds.register(underlineKind)
annotationKinds.register(strikeoutKind)
annotationKinds.register(inkKind)
annotationKinds.register(freetextKind)
annotationKinds.register(shapeKind)
annotationKinds.register(lineKind)
annotationKinds.register(imageKind)
