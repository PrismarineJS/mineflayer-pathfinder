/* eslint-env mocha */

const assert = require('assert')
const { Vec3 } = require('vec3')
const Movements = require('../lib/movements')
const Move = require('../lib/move')

function movementWithBlocks (blocked = []) {
  const movements = Object.create(Movements.prototype)
  movements.liquidCost = 1
  movements.entityCost = 1
  movements.getNumEntitiesAt = () => 0
  movements.safeOrBreak = block => block.safe ? 0 : 100
  movements.getBlock = (node, dx, dy, dz) => {
    const x = node.x + dx
    const y = node.y + dy
    const z = node.z + dz
    const physical = y < 0 || blocked.some(pos => pos.x === x && pos.y === y && pos.z === z)
    return { position: new Vec3(x, y, z), height: y + (physical ? 1 : 0), physical, safe: !physical, liquid: false }
  }
  return movements
}

describe('diagonal corners', () => {
  const start = new Move(0, 0, 0, 0, 0)
  const northeast = { x: 1, z: 1 }

  it('rejects a diagonal when either side clips a wall', () => {
    const movements = movementWithBlocks([{ x: 0, y: 0, z: 1 }])
    const neighbors = []
    movements.getMoveDiagonal(start, northeast, neighbors)
    assert.strictEqual(neighbors.length, 0)
  })

  it('keeps a diagonal through two clear sides', () => {
    const neighbors = []
    movementWithBlocks().getMoveDiagonal(start, northeast, neighbors)
    assert.deepStrictEqual(neighbors.map(n => [n.x, n.y, n.z]), [[1, 0, 1]])
  })

  it('routes a raised landing through a cardinal jump', () => {
    const neighbors = []
    movementWithBlocks([{ x: 1, y: 0, z: 1 }]).getMoveDiagonal(start, northeast, neighbors)
    assert.strictEqual(neighbors.length, 0)
  })
})
