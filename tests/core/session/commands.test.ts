import { describe, expect, it } from 'vitest'
import { compositeCommand, mergeAnnotations } from '../../../src/core/session/commands'
import type { Annotation, InkAnnotation } from '../../../src/core/session/model'
import { AnnotationStore } from '../../../src/core/session/store.svelte'

const ink = (id: string, page = 0): InkAnnotation => ({
  id, page, sourceRef: null, modifiedAt: '', author: '', kind: 'ink',
  strokes: [[[0, 0], [1, 1]]], color: [1, 0, 0], width: 2, opacity: 1, blend: 'normal', role: 'pen',
})

const ids = (list: Annotation[]) => list.map((a) => a.id)

describe('mergeAnnotations', () => {
  it('updates the survivor and removes the absorbed ones; undo restores them in order', () => {
    const store = new AnnotationStore()
    store.load([{ ...ink('a'), sourceRef: '5 0 R' }, ink('x'), { ...ink('b'), sourceRef: '7 0 R' }, ink('c')])
    const before = store.get('a')!
    const after = { ...ink('a'), strokes: [[[0, 0], [9, 9]]] } as InkAnnotation
    const cmd = mergeAnnotations(before, after, [store.get('b')!, store.get('c')!])
    cmd.do(store)
    expect(ids(store.byPage(0))).toEqual(['a', 'x'])
    expect(store.get('a')).toMatchObject({ strokes: [[[0, 0], [9, 9]]], sourceRef: '5 0 R' })
    expect(store.deletedSourceRefs()).toEqual(['7 0 R'])
    cmd.undo(store)
    expect(ids(store.byPage(0))).toEqual(['a', 'x', 'b', 'c'])
    expect(store.get('a')).toEqual(before)
    cmd.do(store)
    expect(ids(store.byPage(0))).toEqual(['a', 'x'])
  })
})

describe('compositeCommand', () => {
  it('runs its parts in order and undoes them in reverse', () => {
    const store = new AnnotationStore()
    const log: string[] = []
    const part = (n: string) => ({ label: n, do: () => void log.push(`do ${n}`), undo: () => void log.push(`undo ${n}`) })
    const cmd = compositeCommand('Both', [part('1'), part('2')])
    expect(cmd.label).toBe('Both')
    cmd.do(store)
    cmd.undo(store)
    expect(log).toEqual(['do 1', 'do 2', 'undo 2', 'undo 1'])
  })
})
