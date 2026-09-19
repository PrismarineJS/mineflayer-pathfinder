/* eslint-env mocha */

// Movements with canOpenDoors: doors and gates are clicked through, never dug.
// A tiny fake world, the real registry and prismarine-block — no server.
const assert = require('assert')
const { Vec3 } = require('vec3')
const { Movements } = require('mineflayer-pathfinder')

const Version = '1.16.5'
const registry = require('minecraft-data')(Version)
const Block = require('prismarine-block')(registry)

function makeWorld () {
  const world = new Map()
  const key = (p) => `${p.x},${p.y},${p.z}`
  const make = (name, props = {}) => Block.fromProperties(name, props, 0)
  const set = (x, y, z, name, props) => { const b = make(name, props); b.position = new Vec3(x, y, z); world.set(key(b.position), b) }
  const blockAt = (pos) => {
    const b = world.get(key(pos))
    if (b) return b
    const nb = make(pos.y < 64 ? 'stone' : 'air'); nb.position = pos.clone(); return nb
  }
  return { set, blockAt }
}

function makeBot (world) {
  return {
    registry,
    version: Version,
    blockAt: world.blockAt,
    entity: { effects: {}, position: new Vec3(0, 64, 0) },
    entities: {},
    game: { minY: 0 },
    inventory: { items: () => [] },
    pathfinder: { bestHarvestTool: () => null }
  }
}

const door = (world, x, y, z, open, half = 'lower') => world.set(x, y, z, 'oak_door', { facing: 'north', half, hinge: 'left', open: String(open), powered: 'false' })
const gate = (world, x, y, z, open) => world.set(x, y, z, 'oak_fence_gate', { facing: 'north', in_wall: 'false', open: String(open), powered: 'false' })
const node = (x, z) => ({ x, y: 64, z, remainingBlocks: 0 })
const east = { x: 1, z: 0 }

describe('canOpenDoors', function () {
  let world, m
  beforeEach(() => {
    world = makeWorld()
    m = new Movements(makeBot(world))
    m.canOpenDoors = true
  })
  const forward = (x, z) => { const n = []; m.getMoveForward(node(x, z), east, n); return n[0] || null }
  const seen = (x, z) => m.getBlock(node(x - 1, z), 1, 0, 0) // the block as the move generators see it (annotated by getBlock)

  it('clicks a closed door once and leaves both halves alone', () => {
    door(world, 5, 64, 0, false); door(world, 5, 65, 0, false, 'upper')
    const mv = forward(4, 0)
    assert(mv, 'no move through the door')
    assert.strictEqual(mv.toBreak.length, 0)
    assert.strictEqual(mv.toPlace.length, 1)
    assert(mv.toPlace[0].useOne)
    assert.strictEqual(mv.toPlace[0].y, 64)
    assert(mv.cost < 5)
  })

  it('walks through an open door without clicking it shut', () => {
    door(world, 5, 64, 0, true); door(world, 5, 65, 0, true, 'upper')
    assert(world.blockAt(new Vec3(5, 64, 0)).shapes.length > 0, 'an open door still has a shape — that is why the gate test is wrong for doors')
    const mv = forward(4, 0)
    assert(mv)
    assert.strictEqual(mv.toPlace.length, 0)
    assert.strictEqual(mv.toBreak.length, 0)
  })

  it('never digs a door, even with canDig on', () => {
    door(world, 5, 64, 0, false); door(world, 5, 65, 0, false, 'upper')
    assert.strictEqual(m.canDig, true)
    assert.strictEqual(m.safeToBreak(seen(5, 0)), false)
    const diag = []; m.getMoveDiagonal(node(4, -1), { x: 1, z: 1 }, diag)
    assert.strictEqual(diag.length, 0, 'diagonal into a door frame')
    const jump = []; m.getMoveJumpUp(node(4, 0), east, jump)
    assert.strictEqual(jump.length, 0, 'jump-up through a door')
  })

  it('still clicks a closed gate, and walks an open one instead of digging it', () => {
    gate(world, 8, 64, 0, false)
    const closed = forward(7, 0)
    assert(closed && closed.toPlace.length === 1 && closed.toPlace[0].useOne)
    assert.strictEqual(m.safeToBreak(seen(8, 0)), false)
    gate(world, 9, 64, 0, true)
    const open = forward(8, 0)
    assert(open, 'no move through an open gate')
    assert.strictEqual(open.toPlace.length, 0)
    assert.strictEqual(open.toBreak.length, 0)
  })

  it('leaves plain walls alone', () => {
    world.set(12, 64, 0, 'oak_planks'); world.set(12, 65, 0, 'oak_planks')
    const dig = forward(11, 0)
    assert(dig && dig.toBreak.length === 2)
    m.canDig = false
    assert.strictEqual(forward(11, 0), null)
    door(world, 5, 64, 0, false); door(world, 5, 65, 0, false, 'upper')
    const mv = forward(4, 0)
    assert(mv && mv.toPlace.length === 1, 'a door is still a move with canDig off')
  })
})
