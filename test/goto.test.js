/* eslint-env mocha */

const mineflayer = require('mineflayer')
const { goals, pathfinder, Movements } = require('mineflayer-pathfinder')
const { Vec3 } = require('vec3')
const mc = require('minecraft-protocol')
const assert = require('assert')
const { once } = require('events')

const Version = '1.16.5'
const ServerPort = 25570

function flatMap (Version) {
  const targetBlock = new Vec3(12, 1, 8)
  const Block = require('prismarine-block')(Version)
  const Chunk = require('prismarine-chunk')(Version)
  const mcData = require('minecraft-data')(Version)
  const chunk = new Chunk()
  chunk.initialize((x, y, z) => {
    if (targetBlock.x === x && targetBlock.y === y && targetBlock.z === z) {
      return new Block(mcData.blocksByName.gold_block.id, 1, 0)
    }
    return y === 0 ? new Block(mcData.blocksByName.bedrock.id, 1, 0) : new Block(mcData.blocksByName.air.id, 1, 0)
  })
  return chunk
}

function generateChunkPacket (chunk) {
  const lights = chunk.dumpLight()
  return {
    x: 0,
    z: 0,
    groundUp: true,
    biomes: chunk.dumpBiomes !== undefined ? chunk.dumpBiomes() : undefined,
    heightmaps: {
      type: 'compound',
      name: '',
      value: {
        MOTION_BLOCKING: { type: 'longArray', value: new Array(36).fill([0, 0]) }
      }
    },
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

async function newServer (server, chunk, spawnPos, Version, useLoginPacket) {
  const mcData = require('minecraft-data')(Version)
  server = mc.createServer({
    'online-mode': false,
    version: Version,
    port: ServerPort
  })
  server.on('login', (client) => {
    let loginPacket
    if (useLoginPacket) {
      loginPacket = mcData.loginPacket
    } else {
      loginPacket = {
        entityId: 0,
        levelType: 'fogetaboutit',
        gameMode: 0,
        previousGameMode: 255,
        worldNames: ['minecraft:overworld'],
        dimension: 0,
        worldName: 'minecraft:overworld',
        hashedSeed: [0, 0],
        difficulty: 0,
        maxPlayers: 20,
        reducedDebugInfo: 1,
        enableRespawnScreen: true
      }
    }
    client.write('login', loginPacket)
    client.write('map_chunk', generateChunkPacket(chunk))
    client.write('position', {
      x: spawnPos.x,
      y: spawnPos.y,
      z: spawnPos.z,
      yaw: 0,
      pitch: 0,
      flags: 0x00
    })
  })
  await once(server, 'listening')
  return server
}

describe('goto unhandled rejection (issue #398)', function () {
  this.timeout(10000)

  const mcData = require('minecraft-data')(Version)
  const targetBlock = new Vec3(12, 1, 8)
  const spawnPos = new Vec3(8.5, 1, 8.5)

  let bot
  let server

  before(async () => {
    const chunk = flatMap(Version)
    server = await newServer(server, chunk, spawnPos, Version, true)
    bot = mineflayer.createBot({
      username: 'player',
      version: Version,
      port: ServerPort
    })
    await once(bot, 'chunkColumnLoad')
    bot.loadPlugin(pathfinder)
    bot.pathfinder.setMovements(new Movements(bot, mcData))
  })
  after(() => {
    bot.end()
    server.close()
  })

  it('does not leak an unhandled PathStopped rejection when goto is interrupted and not awaited', function (done) {
    this.timeout(5000)
    let seen = null
    const handler = (reason) => { seen = reason }
    process.on('unhandledRejection', handler)

    const goal = new goals.GoalNear(targetBlock.x, targetBlock.y, targetBlock.z, 1)
    // deliberately not awaited: the caller stopped waiting (e.g. after a race timeout)
    bot.pathfinder.goto(goal)

    // simulate the pathfinder interrupting the path (bot.emit triggers the
    // 'path_stop' listener that goto() registers, which calls cleanup(err)
    // and rejects the promise inside a setTimeout(0))
    bot.emit('path_stop')

    // wait for the setTimeout(0) inside cleanup to reject, then for the
    // microtask queue to drain and emit unhandledRejection
    setTimeout(() => {
      process.removeListener('unhandledRejection', handler)
      assert.strictEqual(seen, null, 'goto leaked an unhandled PathStopped rejection')
      done()
    }, 100)
  })

  it('still rejects PathStopped for callers that await the promise', async function () {
    this.timeout(5000)
    const goal = new goals.GoalNear(targetBlock.x, targetBlock.y, targetBlock.z, 1)
    const promise = bot.pathfinder.goto(goal)
    bot.emit('path_stop')
    await assert.rejects(promise, { name: 'PathStopped' })
  })
})
