/* eslint-env mocha */

const assert = require('assert')
const { EventEmitter } = require('events')
const { Vec3 } = require('vec3')
const { pathfinder, Movements, goals } = require('..')

function fixture (version = '1.21.4') {
  const registry = require('minecraft-data')(version)
  const Block = require('prismarine-block')(version)
  const blocks = new Map()
  const bot = new EventEmitter()
  bot.registry = registry
  bot.game = { minY: -64 }
  bot.entity = { position: new Vec3(0.5, 64, 0.5), effects: {}, onGround: false }
  bot.entities = {}
  bot.inventory = { items: () => [] }
  bot.clearControlStates = () => {}
  bot.blockAt = p => {
    const position = p.floored()
    const stateId = blocks.get(position.toString()) ?? registry.blocksByName.air.defaultState
    const b = Block.fromStateId(stateId, 0)
    b.position = position
    return b
  }
  function put (name, position, properties = {}) {
    const data = registry.blocksByName[name]
    for (let state = data.minStateId; state <= data.maxStateId; state++) {
      const b = Block.fromStateId(state, 0)
      if (Object.entries(properties).every(([key, value]) => b.getProperties()[key] === value)) {
        blocks.set(position.toString(), state)
        return
      }
    }
    throw new Error(`No matching state for ${name}`)
  }
  return { bot, put, movements: new Movements(bot) }
}

describe('liquid blocks', function () {
  const p = new Vec3(0, 64, 0)
  const waterPlants = ['seagrass', 'tall_seagrass', 'kelp', 'kelp_plant', 'bubble_column']

  for (const name of waterPlants) {
    it(`recognizes ${name} without creating scaffolding to move through it`, function () {
      const { bot, put, movements } = fixture()
      put('water', p)
      put(name, p.offset(1, 0, 0))
      movements.canDig = false
      const neighbors = []
      movements.getMoveForward({ ...p, remainingBlocks: 0 }, { x: 1, z: 0 }, neighbors)
      assert.strictEqual(movements.getBlock(p, 1, 0, 0).liquid, true)
      assert.strictEqual(neighbors.length, 1)
      assert.deepStrictEqual(neighbors[0].toPlace, [])
      assert.strictEqual(bot.blockAt(p.offset(1, 0, 0)).name, name)
    })
  }

  it('distinguishes wet and dry states of the same coral fan', function () {
    const { put, movements } = fixture()
    put('horn_coral_wall_fan', p, { waterlogged: true })
    assert.strictEqual(movements.getBlock(p, 0, 0, 0).liquid, true)
    put('horn_coral_wall_fan', p, { waterlogged: false })
    assert.strictEqual(movements.getBlock(p, 0, 0, 0).liquid, false)
  })

  it('does not generate downward swimming moves from a waterlogged coral fan', function () {
    const { put, movements } = fixture()
    put('horn_coral_wall_fan', p, { waterlogged: true })
    put('water', p.offset(0, -1, 0))
    put('water', p.offset(0, -2, 0))
    const neighbors = []
    movements.getMoveDown({ ...p, remainingBlocks: 0 }, neighbors)
    assert.deepStrictEqual(neighbors, [])
  })

  it('respects dontCreateFlow next to waterlogged blocks', function () {
    const { put, movements } = fixture()
    put('stone', p)
    put('oak_slab', p.offset(1, 0, 0), { waterlogged: true, type: 'bottom' })
    assert.strictEqual(movements.safeToBreak(movements.getBlock(p, 0, 0, 0)), false)
    movements.dontCreateFlow = false
    assert.strictEqual(movements.safeToBreak(movements.getBlock(p, 0, 0, 0)), true)
  })

  it('preserves collision and landing height for solid waterlogged blocks', function () {
    const { put, movements } = fixture()
    put('oak_slab', p.offset(0, -2, 0), { waterlogged: true, type: 'top' })
    const slab = movements.getBlock(p, 0, -2, 0)
    assert.strictEqual(slab.liquid, true)
    assert.strictEqual(slab.physical, true)
    assert.strictEqual(slab.safe, false)
    assert.strictEqual(movements.getLandingBlock(p, { x: 0, z: 0 }).position.y, p.y - 1)
  })

  it('still initializes on versions without water plants or waterlogging', function () {
    const { put, movements } = fixture('1.12.2')
    put('water', p)
    assert.strictEqual(movements.getBlock(p, 0, 0, 0).liquid, true)
    put('stone', p)
    assert.strictEqual(movements.getBlock(p, 0, 0, 0).liquid, false)
  })

  for (const name of ['kelp', 'horn_coral_wall_fan']) {
    it(`keeps ${name} waypoints at their planned swimming height`, function () {
      const { bot, put, movements } = fixture()
      for (let x = 0; x <= 2; x++) {
        put('water', new Vec3(x, 63, 0))
        put(name, new Vec3(x, 64, 0), name === 'horn_coral_wall_fan' ? { waterlogged: true } : {})
      }
      pathfinder(bot)
      movements.canDig = false
      movements.allowEntityDetection = false
      movements.allow1by1towers = false
      bot.pathfinder.setMovements(movements)
      const goal = new goals.GoalBlock(2, 64, 0)
      const raw = bot.pathfinder.getPathFromTo(movements, bot.entity.position, goal, { optimizePath: false }).next().value.result
      const processed = bot.pathfinder.getPathFromTo(movements, bot.entity.position, goal).next().value.result
      assert.strictEqual(raw.status, 'success')
      assert.strictEqual(processed.status, 'success')
      assert.ok(processed.path.length > 0)
      assert.deepStrictEqual(processed.path.map(node => node.y), raw.path.map(node => node.y))
      assert.ok(processed.path.every(node => node.x % 1 === 0.5 && node.z % 1 === 0.5))
    })
  }
})
