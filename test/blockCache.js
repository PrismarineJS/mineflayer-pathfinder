/* eslint-env mocha */

const assert = require('assert')
const { Vec3 } = require('vec3')
const Movements = require('../lib/movements')

const version = '1.21.4'
const registry = require('minecraft-data')(version)
const Chunk = require('prismarine-chunk')(registry)
const World = require('prismarine-world')(registry)

// A world with the chunk at 0 0 loaded, and a bot that reads it the way mineflayer does.
function makeWorld () {
  const world = new World(null).sync
  world.setColumn(0, 0, new Chunk({ minY: -64, worldHeight: 384 }))
  return world
}

function fixture () {
  const bot = { registry, world: makeWorld() }
  bot.blockAt = (p) => bot.world.getBlock(p)
  return { bot, movements: new Movements(bot) }
}

function put (world, name, position) {
  world.setBlockStateId(position, registry.blocksByName[name].defaultState)
}

describe('getBlock cache', function () {
  const p = new Vec3(3, 64, 5)

  const settings = [
    ['air', 'blocksToAvoid', 'add', 'safe'],
    ['white_carpet', 'carpets', 'delete', 'safe'],
    ['stone', 'fences', 'add', 'physical'],
    ['air', 'replaceables', 'delete', 'replaceable'],
    ['ladder', 'climbables', 'delete', 'climbable'],
    ['water', 'liquids', 'delete', 'liquid'],
    ['sand', 'gravityBlocks', 'delete', 'canFall'],
    ['oak_fence_gate', 'openable', 'delete', 'openable']
  ]
  for (const [name, set, op, flag] of settings) {
    it(`uses ${set} as it is now for ${flag} on ${name}`, function () {
      const { bot, movements } = fixture()
      put(bot.world, name, p)
      const before = movements.getBlock(p, 0, 0, 0)[flag]
      movements[set][op](registry.blocksByName[name].id)
      assert.strictEqual(movements.getBlock(p, 0, 0, 0)[flag], !before)
    })
  }

  it('reads light, sky light and biome from the world the bot has now', function () {
    const { bot, movements } = fixture()
    put(bot.world, 'stone', p)
    bot.world.setBlockLight(p, 3)
    bot.world.setSkyLight(p, 15)
    bot.world.setBiome(p, registry.biomesByName.plains.id)
    const first = movements.getBlock(p, 0, 0, 0)
    assert.deepStrictEqual([first.light, first.skyLight, first.biome.name], [3, 15, 'plains'])

    // A dimension change replaces bot.world; the same state id sits at the same position.
    bot.world = makeWorld()
    put(bot.world, 'stone', p)
    bot.world.setBlockLight(p, 12)
    bot.world.setSkyLight(p, 4)
    bot.world.setBiome(p, registry.biomesByName.desert.id)
    const second = movements.getBlock(p, 0, 0, 0)
    assert.strictEqual(second.stateId, first.stateId)
    assert.deepStrictEqual([second.light, second.skyLight, second.biome.name], [12, 4, 'desert'])
  })

  it('matches bot.blockAt for blocks whose shapes move with x and z', function () {
    const { bot, movements } = fixture()
    for (const name of ['bamboo', 'pointed_dripstone', 'stone', 'oak_slab']) {
      for (const [x, z] of [[0, 0], [1, 0], [3, 7], [12, 9], [15, 15]]) {
        const at = new Vec3(x, 64, z)
        put(bot.world, name, at)
        const cached = movements.getBlock(at, 0, 0, 0)
        const fresh = bot.blockAt(at)
        assert.deepStrictEqual(cached.shapes, fresh.shapes, `${name} at ${at}`)
        let height = at.y
        for (const shape of fresh.shapes) height = Math.max(height, at.y + shape[4])
        assert.strictEqual(cached.height, height, `${name} at ${at}`)
      }
    }
  })

  it('sees a block change at a position on the next lookup', function () {
    const { bot, movements } = fixture()
    put(bot.world, 'stone', p)
    assert.strictEqual(movements.getBlock(p, 0, 0, 0).physical, true)
    put(bot.world, 'air', p)
    assert.strictEqual(movements.getBlock(p, 0, 0, 0).physical, false)
  })

  it('treats a block in an unloaded chunk as impassable', function () {
    const { movements } = fixture()
    const b = movements.getBlock(new Vec3(40, 64, 40), 0, 0, 0)
    assert.deepStrictEqual([b.safe, b.physical, b.replaceable], [false, false, false])
  })
})
