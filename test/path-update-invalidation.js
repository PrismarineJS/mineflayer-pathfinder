/* eslint-env mocha */
const assert = require('assert')
const { EventEmitter } = require('events')
const { Vec3 } = require('vec3')
const { pathfinder, Movements, goals } = require('..')

function fixture () {
  const bot = new EventEmitter()
  bot.registry = require('minecraft-data')('1.21.4')
  const Block = require('prismarine-block')('1.21.4')
  bot.game = { minY: -64 }
  bot.entity = { position: new Vec3(0.5, 64, 0.5), velocity: new Vec3(0, 0, 0), effects: {}, onGround: true, isInWater: true }
  bot.entities = {}
  bot.inventory = { items: () => [] }
  bot.controls = {}
  bot.clearControlStates = () => { bot.controls = {} }
  bot.setControlState = (key, value) => { bot.controls[key] = value }
  bot.look = () => {}
  bot.blockAt = p => {
    const b = Block.fromStateId(bot.registry.blocksByName[p.y < 64 ? 'stone' : 'air'].defaultState, 0)
    b.position = p.floored()
    return b
  }
  pathfinder(bot)
  const movements = new Movements(bot)
  movements.canDig = false
  movements.allowEntityDetection = false
  movements.allowParkour = false
  bot.pathfinder.setMovements(movements)
  bot.pathfinder.setGoal(new goals.GoalBlock(3, 64, 0))
  return bot
}

describe('path_update invalidation', () => {
  for (const continuation of [false, true]) {
    for (const change of ['cancel', 'replace goal', 'same goal', 'same movements']) {
      it(`${change} in a ${continuation ? 'continued' : 'fresh'} search callback invalidates the result`, () => {
        const bot = fixture()
        let updates = 0
        if (continuation) bot.pathfinder.tickTimeout = -1
        bot.on('path_update', result => {
          updates++
          if (continuation && updates === 1) {
            assert.strictEqual(result.status, 'partial')
            // Resume the actual A* context next tick with enough time to finish.
            result.context.tickTimeout = 1000
            return
          }
          assert.strictEqual(result.status, 'success')
          assert.ok(result.path.length > 0)
          if (change === 'cancel') bot.pathfinder.setGoal(null)
          if (change === 'replace goal') bot.pathfinder.setGoal(new goals.GoalBlock(-3, 64, 0))
          if (change === 'same goal') bot.pathfinder.setGoal(bot.pathfinder.goal)
          if (change === 'same movements') bot.pathfinder.setMovements(bot.pathfinder.movements)
        })
        bot.emit('physicsTick')
        if (continuation) bot.emit('physicsTick')
        assert.strictEqual(updates, continuation ? 2 : 1)
        assert.strictEqual(bot.pathfinder.isMoving(), false, 'callback reset was overwritten by the old path')
        assert.ok(!bot.controls.forward, 'old path issued forward movement after reset')
      })
    }
  }
})
