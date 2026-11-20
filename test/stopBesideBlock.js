/* eslint-env mocha */

const assert = require('assert')
const { EventEmitter } = require('events')
const { Vec3 } = require('vec3')
const { pathfinder } = require('../index')

// fullStop() moves a bot toward the middle of its block when it stands more than 0.2 off it. These tests stand a
// bot in the block of something smaller than a block, clear of it, and check that the stop leaves it clear.

const HALF = 0.3
const HEIGHT = 1.8
const EPS = 1e-7
const AT = new Vec3(10, 64, 3) // where the block under test stands, on stone at y 63

/** A world of stone at y 63, the block at AT, air everywhere else. */
function world (registry, Block, stateId) {
  const stone = Block.fromStateId(registry.blocksByName.stone.defaultState, 0)
  const air = Block.fromStateId(registry.blocksByName.air.defaultState, 0)
  const block = stateId === undefined ? air : Block.fromStateId(stateId, 0)
  return (p) => {
    const y = Math.floor(p.y)
    return Math.floor(p.x) === AT.x && y === AT.y && Math.floor(p.z) === AT.z ? block : y === 63 ? stone : air
  }
}

/** Whether a bot's box with its feet at x, y, z overlaps a collision box of the world. Touching does not count. */
function collides (blockAt, x, y, z) {
  for (let bx = Math.floor(x - HALF); bx <= Math.floor(x + HALF); bx++) {
    for (let by = Math.floor(y) - 1; by <= Math.floor(y + HEIGHT); by++) {
      for (let bz = Math.floor(z - HALF); bz <= Math.floor(z + HALF); bz++) {
        for (const s of blockAt(new Vec3(bx, by, bz)).shapes) {
          if (x + HALF > bx + s[0] + EPS && x - HALF < bx + s[3] - EPS && y + HEIGHT > by + s[1] + EPS && y < by + s[4] - EPS &&
            z + HALF > bz + s[2] + EPS && z - HALF < bz + s[5] - EPS) return true
        }
      }
    }
  }
  return false
}

function standingBot (registry, blockAt, position) {
  const bot = new EventEmitter()
  bot.registry = registry
  bot.version = registry.version.minecraftVersion
  bot.entity = { position, velocity: new Vec3(0.1, 0, -0.1), width: 2 * HALF, height: HEIGHT }
  bot.clearControlStates = () => {}
  bot.setControlState = () => {}
  bot.blockAt = blockAt
  pathfinder(bot)
  return bot
}

// A goal that is no longer valid makes the pathfinder stop on the next tick, which ends with fullStop().
function stop (bot) {
  bot.pathfinder.setGoal({ isValid: () => false, hasChanged: () => false, isEnd: () => false })
  bot.emit('physicsTick')
  return bot.entity.position
}

// Spots in the block, on a grid of sixteenths (between the lines), at the floor and on top of each part lower
// than a block. Only those where the bot is clear of every box are kept.
function clearSpots (blockAt, shapes) {
  const heights = new Set([0])
  for (const s of shapes) if (s[4] > 0 && s[4] < 1) heights.add(s[4])
  const spots = []
  for (const h of heights) {
    for (let i = 0; i < 16; i++) {
      for (let k = 0; k < 16; k++) {
        const p = new Vec3(AT.x + (i + 0.5) / 16, AT.y + h, AT.z + (k + 0.5) / 16)
        if (!collides(blockAt, p.x, p.y, p.z)) spots.push(p)
      }
    }
  }
  return spots
}

// What the stop must do from a spot: stay clear, go only toward the middle, and on each axis it was off by more
// than 0.2 either reach the middle or stop where a step further would hit a box.
function checkStop (bot, blockAt, from) {
  bot.blockAt = blockAt
  bot.entity.position = from.clone()
  const p = stop(bot)
  const mid = new Vec3(Math.floor(from.x) + 0.5, from.y, Math.floor(from.z) + 0.5)
  if (p.y !== from.y) return `y moved to ${p.y}`
  if (collides(blockAt, p.x, p.y, p.z)) return `moved into a box, to ${p.x.toFixed(4)} ${p.z.toFixed(4)}`
  const step = 1 / 256
  for (const [axis, otherAt] of [['x', from.z], ['z', p.x]]) {
    const a = from[axis]
    const m = mid[axis]
    const to = p[axis]
    if (Math.abs(a - m) <= 0.2) {
      if (to !== a) return `${axis} moved though it was near the middle`
      continue
    }
    if ((to - a) * (m - a) < 0 || Math.abs(to - a) > Math.abs(m - a) + EPS) return `${axis} went away from the middle, to ${to}`
    if (Math.abs(to - m) > EPS) {
      const further = to + Math.sign(m - a) * step
      const hits = axis === 'x' ? collides(blockAt, further, from.y, otherAt) : collides(blockAt, otherAt, from.y, further)
      if (!hits) return `${axis} stopped at ${to.toFixed(4)} short of the middle with room to go on`
    }
  }
  return null
}

// What the stop used to do: the middle of the block on each axis more than 0.2 off it, whatever is there.
function oldStopHits (blockAt, from) {
  const mx = Math.floor(from.x) + 0.5
  const mz = Math.floor(from.z) + 0.5
  const x = Math.abs(from.x - mx) > 0.2 ? mx : from.x
  const z = Math.abs(from.z - mz) > 0.2 ? mz : from.z
  return collides(blockAt, x, from.y, z)
}

// Blocks whose collision boxes are smaller than their block, or off its middle, every state of each.
const BLOCKS = [
  'cocoa', 'lantern', 'soul_lantern', 'candle', 'chain', 'iron_chain', 'end_rod', 'lightning_rod', 'flower_pot',
  'sea_pickle', 'turtle_egg', 'pointed_dripstone', 'bell', 'campfire', 'cake', 'daylight_detector', 'oak_slab',
  'oak_stairs', 'oak_trapdoor', 'oak_door', 'oak_fence', 'cobblestone_wall', 'iron_bars', 'glass_pane',
  'white_carpet', 'snow', 'scaffolding', 'hopper', 'brewing_stand', 'anvil', 'enchanting_table', 'lectern'
]
const VERSIONS = ['1.16.5', '1.20.4', '1.21.4', '26.1']

describe('fullStop beside blocks smaller than their block', function () {
  this.timeout(60000)
  const report = []

  it('moves the bot to the middle of its block on open ground, as before', function () {
    const registry = require('minecraft-data')('1.21.4')
    const Block = require('prismarine-block')(registry)
    const p = stop(standingBot(registry, world(registry, Block), new Vec3(10.8, 64, 3.88)))
    assert.strictEqual(p.x, 10.5)
    assert.strictEqual(p.z, 3.5)
  })

  it('stops short of a ripe cocoa pod and keeps the axis along its log', function () {
    // A ripe pod on a log to the north takes z 3.0625 to 3.5625. From z 3.88 the box can come down to z 3.8625.
    const registry = require('minecraft-data')('1.21.4')
    const Block = require('prismarine-block')(registry)
    const pod = Block.fromProperties(registry.blocksByName.cocoa.id, { age: 2, facing: 'north' }, 0)
    const p = stop(standingBot(registry, world(registry, Block, pod.stateId), new Vec3(10.8, 64, 3.88)))
    assert.strictEqual(p.x, 10.5)
    assert.ok(Math.abs(p.z - 3.8625) < 1e-9, `z ${p.z}`)
  })

  for (const version of VERSIONS) {
    const registry = require('minecraft-data')(version)
    const Block = require('prismarine-block')(registry)
    for (const name of BLOCKS) {
      const block = registry.blocksByName[name]
      if (!block) continue
      it(`${version} ${name}: every state, from every clear spot in its block`, function () {
        const failures = []
        let spots = 0
        let oldHits = 0
        const bot = standingBot(registry, world(registry, Block), new Vec3(0, 0, 0))
        // States with the same boxes (a wall's or a fence's many connections) are tried once.
        const seen = new Set()
        for (let id = block.minStateId; id <= block.maxStateId; id++) {
          const state = Block.fromStateId(id, 0)
          const key = JSON.stringify(state.shapes)
          if (seen.has(key)) continue
          seen.add(key)
          const blockAt = world(registry, Block, id)
          for (const from of clearSpots(blockAt, state.shapes)) {
            spots++
            if (oldStopHits(blockAt, from)) oldHits++
            const why = checkStop(bot, blockAt, from)
            if (why) failures.push(`${JSON.stringify(state.getProperties())} from ${(from.x - AT.x).toFixed(4)} ${(from.y - AT.y).toFixed(4)} ${(from.z - AT.z).toFixed(4)}: ${why}`)
          }
        }
        report.push({ version, name, states: block.maxStateId - block.minStateId + 1, shapes: seen.size, spots, oldHits, failures: failures.length })
        assert.deepStrictEqual(failures.slice(0, 5), [], `${failures.length} of ${spots} spots`)
      })
    }
  }

  after(function () {
    if (process.env.STOP_REPORT) require('fs').writeFileSync(process.env.STOP_REPORT, JSON.stringify(report, null, 1))
  })
})
