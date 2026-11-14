/* eslint-env mocha */
const assert = require('assert')
const { Vec3 } = require('vec3')
const { Movements } = require('..')

// Real block states and movement generator; no Minecraft server is required.
function stairs (drop) {
  const registry = require('minecraft-data')('1.21.4')
  const Block = require('prismarine-block')('1.21.4')
  const bot = {
    registry,
    game: { minY: -64 },
    inventory: { items: () => [] },
    blockAt (p) {
      const pos = p.floored()
      const solid = pos.x === 0 ? pos.y < 64 : pos.y < 64 - drop
      const block = Block.fromStateId(registry.blocksByName[solid ? 'stone' : 'air'].defaultState, 0)
      block.position = pos
      return block
    }
  }
  const movements = new Movements(bot)
  movements.canDig = false
  movements.allowParkour = false
  movements.maxDropDown = 1
  return movements
}

describe('maxDropDown feet displacement', () => {
  it('allows a one-block stair with maxDropDown=1', () => {
    const movements = stairs(1)
    const landing = movements.getLandingBlock(new Vec3(0, 64, 0), { x: 1, z: 0 })
    assert.ok(landing)
    assert.strictEqual(landing.position.y, 63)
    const neighbors = []
    movements.getMoveDropDown({ x: 0, y: 64, z: 0, remainingBlocks: 0 }, { x: 1, z: 0 }, neighbors)
    assert.strictEqual(neighbors.length, 1)
    assert.strictEqual(neighbors[0].y, 63)
  })
  it('rejects a two-block fall with maxDropDown=1', () => {
    assert.strictEqual(stairs(2).getLandingBlock(new Vec3(0, 64, 0), { x: 1, z: 0 }), null)
  })
  it('rejects a one-block fall with maxDropDown=0', () => {
    const movements = stairs(1)
    movements.maxDropDown = 0
    assert.strictEqual(movements.getLandingBlock(new Vec3(0, 64, 0), { x: 1, z: 0 }), null)
  })
})
