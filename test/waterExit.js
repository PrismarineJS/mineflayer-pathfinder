/* eslint-env mocha */

const assert = require('assert')
const { Vec3 } = require('vec3')
const Movements = require('../lib/movements')
const Move = require('../lib/move')

function movementsFor (blocks) {
  const movements = Object.create(Movements.prototype)
  movements.liquidCost = 1
  movements.blocksToAvoid = new Set()
  movements.getBlock = (node, dx, dy, dz) => {
    const position = new Vec3(node.x + dx, node.y + dy, node.z + dz)
    const kind = blocks[`${position.x},${position.y},${position.z}`] || 'air'
    return { position, type: kind, physical: kind === 'stone', liquid: kind === 'water', safe: kind !== 'stone' }
  }
  movements.safeOrBreak = block => block.safe ? 0 : 100
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
})
