/* eslint-env mocha */
// A useOne node only means "make this gate open". When the gate is opened by someone else before
// the bot gets there the executor must not click it shut in its own face. The fake server never
// applies the interaction, so the test checks the intent: no block_place is sent for the gate.
const mineflayer = require('mineflayer')
const { goals, pathfinder, Movements } = require('mineflayer-pathfinder')
const { Vec3 } = require('vec3')
const mc = require('minecraft-protocol')
const assert = require('assert')
const { once } = require('events')

const Version = '1.16.5'
const ServerPort = 25568

const Block = require('prismarine-block')(Version)
const Chunk = require('prismarine-chunk')(Version)
const mcData = require('minecraft-data')(Version)

const gatePos = new Vec3(11, 1, 8)

function gateState (open) {
  const base = mcData.blocksByName.oak_fence_gate
  for (let id = base.minStateId; id <= base.maxStateId; id++) {
    const block = Block.fromStateId(id, 0)
    const state = block.getProperties()
    if (state.facing === 'west' && state.open === open && state.in_wall === false) return block
  }
  throw new Error(`no oak_fence_gate state for open=${open}`)
}

// Bedrock floor, a 1-wide corridor along x (walls at z=7 and z=9) and a closed gate blocking it.
function corridorMap () {
  const gate = gateState(false)
  const chunk = new Chunk()
  chunk.initialize((x, y, z) => {
    if (y === 0) return new Block(mcData.blocksByName.bedrock.id, 1, 0)
    if (y <= 2 && (z === 7 || z === 9)) return new Block(mcData.blocksByName.stone.id, 1, 0)
    if (gatePos.x === x && gatePos.y === y && gatePos.z === z) return gate
    return new Block(mcData.blocksByName.air.id, 1, 0)
  })
  return chunk
}

function chunkPacket (chunk) {
  const lights = chunk.dumpLight()
  return {
    x: 0,
    z: 0,
    groundUp: true,
    biomes: chunk.dumpBiomes !== undefined ? chunk.dumpBiomes() : undefined,
    heightmaps: { type: 'compound', name: '', value: { MOTION_BLOCKING: { type: 'longArray', value: new Array(36).fill([0, 0]) } } },
    bitMap: chunk.getMask(),
    chunkData: chunk.dump(),
    blockEntities: [],
    trustEdges: false,
    skyLightMask: lights?.skyLightMask,
    blockLightMask: lights?.blockLightMask,
    emptySkyLightMask: lights?.emptySkyLightMask,
    emptyBlockLightMask: lights?.emptyBlockLightMask,
    skyLight: lights?.skyLight,
    blockLight: lights?.blockLight
  }
}

describe('stale useOne click', function () {
  /** @type { import('mineflayer').Bot & { pathfinder: import('mineflayer-pathfinder').Pathfinder }} */
  let bot
  let server
  let clicks = []

  before(async () => {
    server = mc.createServer({ 'online-mode': false, version: Version, port: ServerPort })
    server.on('login', (client) => {
      client.on('block_place', (packet) => clicks.push(packet))
      client.write('login', mcData.loginPacket)
      client.write('map_chunk', chunkPacket(corridorMap()))
      client.write('position', { x: 8.5, y: 1, z: 8.5, yaw: 0, pitch: 0, flags: 0x00 })
    })
    await once(server, 'listening')

    bot = mineflayer.createBot({ username: 'player', version: Version, port: ServerPort })
    bot.loadPlugin(pathfinder)
    await once(bot, 'chunkColumnLoad')

    const movements = new Movements(bot, mcData)
    movements.canDig = false
    movements.canOpenDoors = true
    bot.pathfinder.setMovements(movements)
  })

  after(() => {
    bot.end()
    server.close()
  })

  it('skips the click when the gate is already open', async function () {
    this.timeout(20_000)
    clicks = []

    const done = bot.pathfinder.goto(new goals.GoalNear(14, 1, 8, 1))
    // let the bot plan and start walking, then open the gate like another player would
    const t0 = Date.now()
    while (bot.entity.position.x < 9 && Date.now() - t0 < 5000) await new Promise((resolve) => setTimeout(resolve, 50))
    assert.ok(bot.entity.position.x >= 9, 'the bot started walking before the gate was opened')
    await bot.world.setBlock(gatePos, gateState(true))

    await done
    assert.ok(bot.entity.position.x > 11.5, `crossed the open gate (x=${bot.entity.position.x.toFixed(1)})`)
    assert.strictEqual(clicks.length, 0, 'must not click a gate that is already open')
  })
})
