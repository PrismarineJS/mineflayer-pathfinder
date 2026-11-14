/* eslint-env mocha */

const assert = require('assert')
const { EventEmitter } = require('events')
const { Vec3 } = require('vec3')
const { pathfinder, goals } = require('mineflayer-pathfinder')

// The real pathfinder and mineflayer digging plugins on a bot with no server behind it
function createBot () {
  const bot = new EventEmitter()
  bot.registry = require('minecraft-data')('1.16.5')
  bot.entity = { position: new Vec3(0.5, 64, 0.5), velocity: new Vec3(0, 0, 0), onGround: true, effects: {} }
  bot.inventory = { items: () => [], slots: [] }
  bot.game = { gameMode: 'survival' }
  bot.getEquipmentDestSlot = () => 5
  bot.clearControlStates = () => {}
  bot.blockAt = () => ({ position: new Vec3(1, 64, 0), type: 1, digTime: () => 100 })
  bot.lookAt = async () => {}
  bot.swingArm = () => {}
  bot._client = { write: () => {} }
  bot._updateBlockState = (position) => bot.emit(`blockUpdate:${position}`, null, { type: 0, position })
  require('mineflayer/lib/plugins/digging')(bot)
  pathfinder(bot)
  bot.pathfinder.getPathTo = () => ({ status: 'success', path: [{ x: 1, y: 64, z: 0, toBreak: [{ x: 1, y: 64, z: 0 }], toPlace: [] }] })
  return bot
}

const nextTurn = () => new Promise(resolve => setImmediate(resolve))

function startDiggingPath (bot) {
  bot.pathfinder.setGoal(new goals.GoalBlock(3, 64, 0))
  bot.emit('physicsTick')
}

describe('digging listeners', () => {
  it('leaves no listener behind when the dig fails before it starts', async () => {
    const bot = createBot()
    bot.lookAt = async () => { throw new Error('look failed') }
    for (let i = 0; i < 20; i++) {
      startDiggingPath(bot)
      await nextTurn()
    }
    assert.strictEqual(bot.listenerCount('diggingAborted'), 0)
    assert.strictEqual(bot.listenerCount('diggingCompleted'), 0)
    assert.strictEqual(bot.pathfinder.isMining(), false)
  })

  it('listens once across repeated resets and keeps the listeners of others', async () => {
    const bot = createBot()
    let finishLooking
    bot.lookAt = () => new Promise(resolve => { finishLooking = resolve })
    const other = () => {}
    bot.on('diggingAborted', other)
    bot.on('diggingCompleted', other)

    startDiggingPath(bot)
    for (let i = 0; i < 20; i++) bot.pathfinder.setGoal(null)
    assert.strictEqual(bot.listenerCount('diggingAborted'), 2)
    assert.strictEqual(bot.listenerCount('diggingCompleted'), 2)

    finishLooking()
    await nextTurn()
    bot.stopDigging()
    await nextTurn()
    assert.deepStrictEqual(bot.listeners('diggingAborted'), [other])
    assert.deepStrictEqual(bot.listeners('diggingCompleted'), [other])
    assert.strictEqual(bot.pathfinder.isMining(), false)
  })
})
