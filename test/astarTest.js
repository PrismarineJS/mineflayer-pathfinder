/* eslint-env mocha */

const assert = require('assert')
const AStar = require('../lib/astar')

function move (hash, x, z, cost = 1, safety = 0) {
  return {
    hash,
    x,
    y: 0,
    z,
    cost,
    safety,
    remainingBlocks: 0,
    toBreak: [],
    toPlace: [],
    parkour: false
  }
}

function graphMovements (neighbors) {
  return {
    getNeighbors (node) {
      return neighbors[node.hash] || []
    }
  }
}

describe('AStar anytime objective', () => {
  const start = move('start', 0, 0)
  const nearer = move('nearer', 1, 0, 1, 1)
  const safer = move('safer', 0, 1, 1, 10)
  const movements = graphMovements({ start: [nearer, safer] })
  const goal = {
    heuristic (node) {
      return Math.abs(2 - node.x) + Math.abs(node.z)
    },
    isEnd () {
      return false
    }
  }

  it('returns the highest-scoring reachable node when the expansion budget is reached', () => {
    const result = new AStar(start, movements, goal, 1000, 1000, -1, {
      maxVisitedNodes: 1,
      nodeEvaluator: node => node.safety
    }).compute()

    assert.strictEqual(result.status, 'budget')
    assert.strictEqual(result.visitedNodes, 1)
    assert.strictEqual(result.objectiveScore, 10)
    assert.deepStrictEqual(result.path.map(node => node.hash), ['safer'])
  })

  it('preserves heuristic-based best-node selection when no objective is supplied', () => {
    const result = new AStar(start, movements, goal, 1000, 1000, -1, {
      maxVisitedNodes: 1
    }).compute()

    assert.strictEqual(result.status, 'budget')
    assert.strictEqual(result.objectiveScore, null)
    assert.deepStrictEqual(result.path.map(node => node.hash), ['nearer'])
  })

  it('uses lower route cost to break equal objective scores', () => {
    const expensive = move('expensive', 1, 0, 3, 5)
    const cheap = move('cheap', 0, 1, 1, 5)
    const result = new AStar(start, graphMovements({ start: [expensive, cheap] }), goal, 1000, 1000, -1, {
      maxVisitedNodes: 1,
      nodeEvaluator: node => node.safety
    }).compute()

    assert.strictEqual(result.status, 'budget')
    assert.strictEqual(result.cost, 1)
    assert.deepStrictEqual(result.path.map(node => node.hash), ['cheap'])
  })
})
