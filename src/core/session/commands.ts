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
  // Per-page z-index of each annotation at delete time, so undo restores order.
  let slots: { a: Annotation; index: number }[] = []
  return {
    label: 'Delete annotation',
    do: (s) => {
      slots = list.map((a) => ({ a, index: s.byPage(a.page).findIndex((x) => x.id === a.id) }))
      list.forEach((a) => s.remove(a.id))
    },
    undo: (s) => {
      // Ascending index per page: each insert lands at its original position.
      const sorted = slots.slice().sort((x, y) => x.a.page - y.a.page || x.index - y.index)
      for (const { a, index } of sorted) s.add(a, index < 0 ? undefined : index)
    },
  }
}

/** Moves several annotations as one undo step: each `before` becomes the `after` with its id. */
export function updateAnnotations(label: string, changes: { before: Annotation; after: Annotation }[]): Command {
  return compositeCommand(label, changes.map(({ before, after }) => updateAnnotation(before, after)))
}

/**
 * Marks annotations flattened (burned into the page content on the next
 * save; see Base.flattened), one undo step. Already flattened ones are skipped.
 */
export function flattenAnnotations(list: Annotation[], modifiedAt = new Date().toISOString()): Command {
  return updateAnnotations(
    'Flatten annotations',
    list.filter((a) => !a.flattened).map((a) => ({ before: a, after: { ...a, flattened: true, modifiedAt } })),
  )
}

/** One undo step made of `parts`: done in order, undone in reverse. */
export function compositeCommand(label: string, parts: Command[]): Command {
  return {
    label,
    do: (s) => parts.forEach((c) => c.do(s)),
    undo: (s) => [...parts].reverse().forEach((c) => c.undo(s)),
  }
}

/**
 * Merges `absorbed` into `before` (the survivor, which keeps its id, file
 * object and z-position) as `after`. Undo restores every original, in its
 * original order.
 */
export function mergeAnnotations(before: Annotation, after: Annotation, absorbed: Annotation[]): Command {
  return compositeCommand('Merge annotations', [deleteAnnotations(absorbed), updateAnnotation(before, after)])
}
