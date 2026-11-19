import { annotationKinds } from '../core/registry/annotationKinds'
import { highlightKind } from './highlight'
import { inkKind } from './ink'

annotationKinds.register(highlightKind)
annotationKinds.register(inkKind)
