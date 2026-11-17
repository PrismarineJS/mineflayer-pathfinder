/* eslint-env mocha */

const assert = require('assert')
const { EventEmitter } = require('events')
const { Vec3 } = require('vec3')
const { pathfinder } = require('../index')

// A bot standing 0.3 of a block off the middle of its block, for a registry of either edition. No world and no
// server: the pathfinder is only asked to stop.
function standingBot (version) {
  const bot = new EventEmitter()
  bot.registry = require('prismarine-registry')(version)
  bot.version = bot.registry.version.minecraftVersion
  bot.entity = { position: new Vec3(10.8, 64, 3.2), velocity: new Vec3(0.1, 0, -0.1) }
  bot.clearControlStates = () => {}
  bot.setControlState = () => {}
  pathfinder(bot)
  return bot
}

// A goal that is no longer valid makes the pathfinder stop on the next tick, which ends with fullStop().
function stopOnNextTick (bot) {
  bot.pathfinder.setGoal({ isValid: () => false, hasChanged: () => false, isEnd: () => false })
  bot.emit('physicsTick')
}

describe('fullStop', function () {
  it('on Java, moves the bot to the middle of its block when it stops', function () {
    const bot = standingBot('1.20.4')
    stopOnNextTick(bot)
    assert.strictEqual(bot.entity.position.x, 10.5)
    assert.strictEqual(bot.entity.position.z, 3.5)
    assert.strictEqual(bot.entity.velocity.x, 0)
    assert.strictEqual(bot.entity.velocity.z, 0)
  })

  it('on Bedrock, leaves the bot where it is: the server is the judge of where the player stands', function () {
    // A Bedrock server checks every move the client reports and sends the player back when it disagrees, so the
    // shift is refused and the bot is corrected back after every stop.
    const bot = standingBot('bedrock_1.20.0')
    stopOnNextTick(bot)
    assert.strictEqual(bot.entity.position.x, 10.8)
    assert.strictEqual(bot.entity.position.z, 3.2)
    assert.strictEqual(bot.entity.velocity.x, 0)
    assert.strictEqual(bot.entity.velocity.z, 0)
  })
})
