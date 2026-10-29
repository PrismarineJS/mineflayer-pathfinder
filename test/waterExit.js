/* eslint-env mocha */

const assert = require('assert')
const Movements = require('../lib/movements')
const Move = require('../lib/move')

function movementsFor (blocks) {
  const registry = require('minecraft-data')('1.20.4')
  const Block = require('prismarine-block')(registry)
  const movements = new Movements({
    registry,
    blockAt: position => {
      const kind = blocks[`${position.x},${position.y},${position.z}`] || 'air'
      const block = Block.fromStateId(registry.blocksByName[kind].minStateId, 0)
      block.position = position
      return block
    }
  })
  movements.canDig = false
  return movements
}

describe('water exit movements', () => {
  const start = new Move(0, 0, 0, 0, 0)

  it('swims up through a water column without scaffolding', () => {
    const movements = movementsFor({ '0,0,0': 'water', '0,1,0': 'water' })
    const neighbors = []
    movements.getMoveWaterExit(start, neighbors)
    assert.ok(neighbors.some(n => n.x === 0 && n.y === 1 && n.z === 0 && n.toPlace.length === 0))
  })

  it('plans a step from water onto a clear shore', () => {
    const movements = movementsFor({ '0,0,0': 'water', '1,0,0': 'stone' })
    const neighbors = []
    movements.getMoveWaterExit(start, neighbors)
    assert.ok(neighbors.some(n => n.x === 1 && n.y === 1 && n.z === 0))
  })

  it('does not plan an exit under a solid ceiling', () => {
    const movements = movementsFor({ '0,0,0': 'water', '0,2,0': 'stone', '1,0,0': 'stone' })
    const neighbors = []
    movements.getMoveWaterExit(start, neighbors)
    assert.strictEqual(neighbors.length, 0)
  })

  for (const kind of ['lava', 'fire', 'cobweb']) {
    for (const y of [1, 2]) {
      it(`does not swim into ${kind} at height ${y}`, () => {
        const movements = movementsFor({ '0,0,0': 'water', '0,1,0': 'water', [`0,${y},0`]: kind })
        const neighbors = []
        movements.getMoveWaterExit(start, neighbors)
        assert.strictEqual(neighbors.length, 0)
      })
    }
  }

  it('does not swim upward from lava', () => {
    const movements = movementsFor({ '0,0,0': 'lava', '0,1,0': 'water' })
    const neighbors = []
    movements.getMoveWaterExit(start, neighbors)
    assert.strictEqual(neighbors.length, 0)
  })

  for (const y of [1, 2]) {
    it(`rejects an excluded ascent cell at height ${y}`, () => {
      const movements = movementsFor({ '0,0,0': 'water', '0,1,0': 'water' })
      movements.exclusionAreasStep.push(block => block.position.y === y ? 100 : 0)
      const neighbors = []
      movements.getMoveWaterExit(start, neighbors)
      assert.strictEqual(neighbors.length, 0)
    })
  }

  it('includes destination and head exclusion penalties in the ascent cost', () => {
    const movements = movementsFor({ '0,0,0': 'water', '0,1,0': 'water' })
    movements.exclusionAreasStep.push(block => block.position.y === 1 ? 7 : 3)
    const neighbors = []
    movements.getMoveWaterExit(start, neighbors)
    assert.strictEqual(neighbors.length, 1)
    assert.strictEqual(neighbors[0].cost, 1 + movements.liquidCost + 10)
  })
})
