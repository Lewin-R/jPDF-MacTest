import type { Command } from './history.svelte'
import type { Annotation } from './model'

export function addAnnotations(list: Annotation[]): Command {
  return {
    label: 'Add annotation',
    do: (s) => list.forEach((a) => s.add(a)),
    undo: (s) => [...list].reverse().forEach((a) => s.remove(a.id)),
  }
}

export function updateAnnotation(before: Annotation, after: Annotation): Command {
  return {
    label: 'Edit annotation',
    do: (s) => s.update(before.id, after),
    undo: (s) => s.update(before.id, before),
  }
}

export function deleteAnnotations(list: Annotation[]): Command {
  return {
    label: 'Delete annotation',
    do: (s) => list.forEach((a) => s.remove(a.id)),
    undo: (s) => list.forEach((a) => s.add(a)),
  }
}
