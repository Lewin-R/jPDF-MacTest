import { annotationKinds } from '../core/registry/annotationKinds'
import { freetextKind } from './freetext'
import { highlightKind } from './highlight'
import { inkKind } from './ink'

annotationKinds.register(highlightKind)
annotationKinds.register(inkKind)
annotationKinds.register(freetextKind)
