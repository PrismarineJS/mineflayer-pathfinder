/* eslint-env mocha */

const assert = require('assert')
const { EventEmitter } = require('events')
const { Vec3 } = require('vec3')
const { pathfinder } = require('../index')

const Version = '1.21.4'
const registry = require('minecraft-data')(Version)
const Block = require('prismarine-block')(registry)

// A bot standing on stone at y 64, in a world of the blocks given. No server: the pathfinder is only asked to stop.
function standingBot (position, blocks = {}) {
  const bot = new EventEmitter()
  bot.registry = registry
  bot.version = Version
  bot.entity = { position, velocity: new Vec3(0.1, 0, -0.1), height: 1.8 }
  bot.clearControlStates = () => {}
  bot.setControlState = () => {}
  bot.blockAt = (p) => {
    const key = `${Math.floor(p.x)},${Math.floor(p.y)},${Math.floor(p.z)}`
    const block = blocks[key] ?? (Math.floor(p.y) === 63 ? Block.fromProperties(registry.blocksByName.stone.id, {}, 0) : Block.fromStateId(registry.blocksByName.air.defaultState, 0))
    block.position = p.floored()
    return block
  }
  pathfinder(bot)
  return bot
}

// A goal that is no longer valid makes the pathfinder stop on the next tick, which ends with fullStop().
function stopOnNextTick (bot) {
  bot.pathfinder.setGoal({ isValid: () => false, hasChanged: () => false, isEnd: () => false })
  bot.emit('physicsTick')
}

const cocoa = (age, facing) => Block.fromProperties(registry.blocksByName.cocoa.id, { age, facing }, 0)
const log = () => Block.fromProperties(registry.blocksByName.jungle_log.id, { axis: 'y' }, 0)

describe('fullStop beside a block smaller than its block', function () {
  it('moves the bot to the middle of its block on open ground, as before', function () {
    const bot = standingBot(new Vec3(10.8, 64, 3.88))
    stopOnNextTick(bot)
    assert.strictEqual(bot.entity.position.x, 10.5)
    assert.strictEqual(bot.entity.position.z, 3.5)
    assert.strictEqual(bot.entity.velocity.x, 0)
    assert.strictEqual(bot.entity.velocity.z, 0)
  })

  it('does not move the bot into a cocoa pod that shares its block', function () {
    // A ripe pod on a log to the north takes z 3.0625 to 3.5625 of the block. The bot stands in the same block,
    // clear of it, at z 3.88: in the middle (z 3.5) its box would reach down to z 3.2, inside the pod.
    const bot = standingBot(new Vec3(10.8, 64, 3.88), {
      '10,64,2': log(),
      '10,64,3': cocoa(2, 'north')
    })
    stopOnNextTick(bot)
    // Across, along the log, the middle is clear: the bot is still moved there.
    assert.strictEqual(bot.entity.position.x, 10.5)
    assert.strictEqual(bot.entity.position.z, 3.88)
  })

  it('does not move the bot into a young pod to the east either', function () {
    // A young pod on a log to the east takes x 10.6875 to 10.9375 and z 3.375 to 3.625.
    const bot = standingBot(new Vec3(10.12, 64, 3.5), {
      '11,64,3': log(),
      '10,64,3': cocoa(0, 'east')
    })
    stopOnNextTick(bot)
    assert.strictEqual(bot.entity.position.x, 10.12)
    assert.strictEqual(bot.entity.position.z, 3.5)
  })
})
