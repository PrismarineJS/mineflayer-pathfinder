/* eslint-env mocha */

const assert = require('assert')
const Heap = require('../lib/heap.js')

function popAll (heap) {
  const out = []
  while (!heap.isEmpty()) out.push(heap.pop().f)
  return out
}

function buildAndPop (values) {
  const heap = new Heap()
  values.forEach((f, id) => heap.push({ f, id }))
  return popAll(heap)
}

describe('BinaryHeapOpenSet', function () {
  it('pops in non-decreasing f order for a minimal 3-element heap', function () {
    // Regression case for the sift-down bound bug: a 3-node heap where the
    // right child sits at the last array index (size === 3, smallerChild === 2)
    // used to never be compared against during pop(), because the guard was
    // `smallerChild < size - 1` (2 < 2 === false) instead of `smallerChild < size`.
    const out = buildAndPop([9, 3, 7])
    assert.deepStrictEqual(out, [3, 7, 9])
  })

  it('pops in non-decreasing f order across many random sequences', function () {
    for (let trial = 0; trial < 2000; trial++) {
      const n = 3 + Math.floor(Math.random() * 30)
      const values = Array.from({ length: n }, () => Math.floor(Math.random() * 100))
      const out = buildAndPop(values)
      const expected = [...values].sort((a, b) => a - b)
      assert.deepStrictEqual(out, expected, `failed on input ${JSON.stringify(values)}, got ${JSON.stringify(out)}`)
    }
  })

  it('respects update() (decrease-key) when reprioritizing an open node', function () {
    const heap = new Heap()
    const nodes = [10, 20, 30, 40, 50].map((f, id) => ({ f, id }))
    nodes.forEach(n => heap.push(n))
    // discover a cheaper route to the node that was pushed with f=50
    nodes[4].f = 5
    heap.update(nodes[4])
    const out = popAll(heap)
    assert.deepStrictEqual(out, [5, 10, 20, 30, 40])
  })
})
