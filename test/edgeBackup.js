/* eslint-env mocha */

const assert = require('assert')
const { EventEmitter } = require('events')
const { Vec3 } = require('vec3')
const { pathfinder, goals } = require('mineflayer-pathfinder')

const node = (x, y, z, toPlace = []) => Object.assign(new Vec3(x, y, z), { toBreak: [], toPlace })

// Bridging east from the block under the bot: it has to back up to the east edge first
const bridge = () => [node(1.5, 64, 0.5, [{ x: 0, y: 63, z: 0, dx: 1, dy: 0, dz: 0 }])]
const walk = () => [node(-2.5, 64, 0.5)]

// The real pathfinder on a bot with no server behind it. getPathTo hands out the given paths in
// turn, and the physics reaches the next node of any straight walk.
function createBot (paths) {
  const bot = new EventEmitter()
  bot.version = '1.16.5'
  bot.registry = require('minecraft-data')(bot.version)
  bot.entity = { position: new Vec3(0.5, 64, 0.5), velocity: new Vec3(0, 0, 0), onGround: true, effects: {}, attributes: {}, yaw: 0, pitch: 0 }
  bot.inventory = { items: () => [], slots: [] }
  bot.game = { gameMode: 'survival', minY: 0, height: 256 }
  bot.controlState = {}
  bot.setControlState = (control, state) => { bot.controlState[control] = state }
  bot.getControlState = (control) => bot.controlState[control] === true
  bot.clearControlStates = () => { bot.controlState = {} }
  bot.blockAt = () => null
  bot.lookAt = async () => {}
  bot.look = async () => {}
  bot.equip = () => new Promise(() => {})
  let path = []
  bot.physics = { simulatePlayer: (state) => { state.pos = path[0].clone(); state.onGround = true } }
  pathfinder(bot)
  bot.pathfinder.movements.getScaffoldingItem = () => ({ name: 'dirt' })
  bot.pathfinder.getPathTo = () => {
    path = paths.shift() ?? []
    return { status: 'success', path }
  }
  return bot
}

function backUpToEdge (bot, goal) {
  bot.pathfinder.setGoal(goal)
  bot.emit('physicsTick')
  assert.ok(bot.getControlState('back') && bot.getControlState('sneak'), 'not backing up to the edge')
}

function blockUpdateOnPath (bot) {
  const position = new Vec3(1, 63, 0)
  bot.emit('blockUpdate', { position, type: 0 }, { position, type: 1 })
}

describe('backing up to an edge to bridge', () => {
  it('lets go of back and sneak when a block update throws the path away', () => {
    const bot = createBot([bridge(), walk()])
    backUpToEdge(bot, new goals.GoalBlock(3, 64, 0))
    const resets = []
    bot.on('path_reset', reason => resets.push(reason))
    blockUpdateOnPath(bot)
    assert.deepStrictEqual(resets, ['block_updated'])
    bot.emit('physicsTick')
    assert.strictEqual(bot.getControlState('forward'), true)
    assert.strictEqual(bot.getControlState('back'), false, 'back still held')
    assert.strictEqual(bot.getControlState('sneak'), false, 'sneak still held')
  })

  it('lets go of back and sneak when the followed entity moves away', () => {
    const bot = createBot([bridge(), walk()])
    const entity = { position: new Vec3(3.5, 64, 0.5), isValid: true }
    backUpToEdge(bot, new goals.GoalFollow(entity, 1))
    entity.position = new Vec3(-4.5, 64, 0.5)
    bot.emit('physicsTick')
    assert.strictEqual(bot.getControlState('forward'), true)
    assert.strictEqual(bot.getControlState('back'), false, 'back still held')
    assert.strictEqual(bot.getControlState('sneak'), false, 'sneak still held')
  })

  it('backs up again when the new path bridges from the same edge', () => {
    const bot = createBot([bridge(), bridge()])
    backUpToEdge(bot, new goals.GoalBlock(3, 64, 0))
    blockUpdateOnPath(bot)
    bot.emit('physicsTick')
    assert.strictEqual(bot.getControlState('back'), true)
    assert.strictEqual(bot.getControlState('sneak'), true)
  })

  it('keeps walking through a block update that comes during a walk', () => {
    const bot = createBot([walk(), walk()])
    bot.pathfinder.setGoal(new goals.GoalBlock(-3, 64, 0))
    bot.emit('physicsTick')
    assert.strictEqual(bot.getControlState('forward'), true)
    bot.emit('blockUpdate', { position: new Vec3(-3, 63, 0), type: 0 }, { position: new Vec3(-3, 63, 0), type: 1 })
    assert.strictEqual(bot.getControlState('forward'), true)
  })
})
