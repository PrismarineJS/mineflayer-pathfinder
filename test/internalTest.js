/* eslint-env mocha */

const mineflayer = require('mineflayer')
const { goals, pathfinder, Movements } = require('mineflayer-pathfinder')
const { Vec3 } = require('vec3')
const mc = require('minecraft-protocol')
const assert = require('assert')
const { v4: uuidv4 } = require('uuid')
const Entity = require('prismarine-entity')
const { once } = require('events')

const Version = '1.16.5'

/**
 *
 * @param {import('minecraft-protocol').Server} server
 * @param {import('vec3').Vec3} targetBlock
 * @param {import('vec3').Vec3} spawnPos
 * @param {string} Version
 * @returns {Promise<void>}
 */
async function newServer (server, targetBlock, spawnPos, Version, useLoginPacket) {
  const Block = require('prismarine-block')(Version)
  const Chunk = require('prismarine-chunk')(Version)
  const mcData = require('minecraft-data')(Version)
  server = mc.createServer({
    'online-mode': false,
    version: Version,
    // 25565 - local server, 25566 - proxy server
    port: 25567
  })
  server.on('listening', () => {
    console.info('Listening')
  })
  server.on('login', (client) => {
    const chunk = new Chunk()
    chunk.initialize((x, y, z) => {
      if (targetBlock.x === x && targetBlock.y === y && targetBlock.z === z) {
        return new Block(mcData.blocksByName.gold_block.id, 1, 0)
      }
      return y === 0 ? new Block(mcData.blocksByName.bedrock.id, 1, 0) : new Block(mcData.blocksByName.air.id, 1, 0) // Bedrock floor
    })
    let loginPacket
    // if (bot.supportFeature('usesLoginPacket')) {
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

    client.write('map_chunk', {
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
      }, // send fake heightmap
      bitMap: chunk.getMask(),
      chunkData: chunk.dump(),
      blockEntities: []
    })

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

describe('pathfinder Goals', function () {
  const mcData = require('minecraft-data')(Version)

  const targetBlock = new Vec3(12, 1, 8) // a gold block away from the spawn position
  const spawnPos = new Vec3(8.5, 1, 8.5) // Center of the chunk & center of the block

  /** @type { import('mineflayer').Bot & { pathfinder: import('mineflayer-pathfinder').Pathfinder }} */
  let bot
  /** @type { import('minecraft-protocol').Server } */
  let server

  before(async () => {
    server = await newServer(server, targetBlock, spawnPos, Version, true)
    bot = mineflayer.createBot({
      username: 'player',
      version: Version,
      port: 25567
    })
    await once(bot, 'chunkColumnLoad')
  })
  after(() => server.close())

  describe('Goals', () => {
    beforeEach(() => {
      bot.entity.position = spawnPos.clone()
    })

    it('GoalBlock', () => {
      const goal = new goals.GoalBlock(targetBlock.x, targetBlock.y, targetBlock.z)
      assert.ok(!goal.isEnd(bot.entity.position))
      bot.entity.position = targetBlock.clone()
      assert.ok(goal.isEnd(bot.entity.position))
    })

    it('GoalNear', () => {
      const goal = new goals.GoalNear(targetBlock.x, targetBlock.y, targetBlock.z, 1)
      assert.ok(!goal.isEnd(bot.entity.position))
      bot.entity.position = targetBlock.offset(1, 0, 0)
      assert.ok(goal.isEnd(bot.entity.position))
    })

    it('GoalXZ', () => {
      const goal = new goals.GoalXZ(targetBlock.x, targetBlock.z)
      assert.ok(!goal.isEnd(bot.entity.position))
      bot.entity.position = targetBlock.offset(0, 1, 0)
      assert.ok(goal.isEnd(bot.entity.position))
    })

    it('GoalNearXZ', () => {
      const goal = new goals.GoalNearXZ(targetBlock.x, targetBlock.z, 1)
      assert.ok(!goal.isEnd(bot.entity.position))
      bot.entity.position = targetBlock.offset(1, 0, 0)
      assert.ok(goal.isEnd(bot.entity.position))
    })

    it('GoalY', () => {
      const goal = new goals.GoalY(targetBlock.y + 1)
      assert.ok(!goal.isEnd(bot.entity.position))
      bot.entity.position = targetBlock.offset(0, 1, 0)
      assert.ok(goal.isEnd(bot.entity.position))
    })

    it('GoalGetToBlock', () => {
      const goal = new goals.GoalGetToBlock(targetBlock.x, targetBlock.y, targetBlock.z)
      assert.ok(!goal.isEnd(bot.entity.position))
      bot.entity.position = targetBlock.offset(1, 0, 0)
      assert.ok(goal.isEnd(bot.entity.position))
    })

    it('GoalCompositeAny', () => {
      const targetBlock2 = new Vec3(10, 1, 0)
      const goal1 = new goals.GoalBlock(targetBlock.x, targetBlock.y, targetBlock.z)
      const goal2 = new goals.GoalBlock(targetBlock2.x, targetBlock2.y, targetBlock2.z)
      const goalComposite = new goals.GoalCompositeAny()
      goalComposite.goals = [goal1, goal2]
      assert.ok(!goalComposite.isEnd(bot.entity.position))
      bot.entity.position = targetBlock.clone()
      assert.ok(goalComposite.isEnd(bot.entity.position)) // target block 1
      bot.entity.position = targetBlock2.clone()
      assert.ok(goalComposite.isEnd(bot.entity.position)) // target block 2
    })

    it('GoalCompositeAll', () => {
      const targetBlock = new Vec3(2, 1, 0)
      const block2 = new Vec3(3, 1, 0)
      const goal1 = new goals.GoalBlock(targetBlock.x, targetBlock.y, targetBlock.z)
      const goal2 = new goals.GoalNear(block2.x, block2.y, block2.z, 2)
      const goalComposite = new goals.GoalCompositeAll()
      goalComposite.goals = [goal1, goal2]
      assert.ok(!goalComposite.isEnd(bot.entity.position))
      bot.entity.position = targetBlock.offset(0, 0, 0)
      assert.ok(goalComposite.isEnd(bot.entity.position))
    })

    it('GoalInvert', () => {
      const goalBlock = new goals.GoalBlock(targetBlock.x, targetBlock.y, targetBlock.z)
      const goal = new goals.GoalInvert(goalBlock)
      bot.entity.position = targetBlock.clone()
      assert.ok(!goal.isEnd(bot.entity.position))
      bot.entity.position = new Vec3(0, 1, 0)
      assert.ok(goal.isEnd(bot.entity.position))
    })

    it('GoalPlaceBlock', () => {
      const placeTarget = targetBlock.offset(0, 1, 0)
      const goal = new goals.GoalPlaceBlock(placeTarget, bot.world, {})
      bot.entity.position = targetBlock.offset(-5, 0, 0) // to far away to reach
      assert.ok(!goal.isEnd(bot.entity.position.floored()))
      bot.entity.position = targetBlock.offset(-2, 0, 0)
      assert.ok(goal.isEnd(bot.entity.position.floored()))
    })

    it('GoalBreakBlock', () => {
      const breakTarget = targetBlock.clone() // should be a gold block
      const goal = new goals.GoalBreakBlock(breakTarget.x, breakTarget.y, breakTarget.z, bot)
      assert.ok(!goal.isEnd(bot.entity.position.floored()))
      bot.entity.position = targetBlock.offset(-2, 0, 0) // should now be close enough
      assert.ok(goal.isEnd(bot.entity.position.floored()))
    })
  })

  describe('Goals with entity', () => {
    beforeEach(() => {
      bot.entity.position = spawnPos.clone()
    })
    before((done) => {
      const chicken = new Entity(mcData.entitiesByName.chicken.id)
      const client = Object.values(server.clients)[0]
      client.write('spawn_entity', { // Might only work for 1.16
        entityId: chicken.id,
        objectUUID: uuidv4(),
        type: chicken.type,
        x: targetBlock.x,
        y: targetBlock.y + 1,
        z: targetBlock.z,
        pitch: 0,
        yaw: 0,
        objectData: 0,
        velocityX: 0,
        velocityY: 0,
        velocityZ: 0
      })
      setTimeout(done, 100)
    })

    it('GoalFollow', () => {
      const entity = bot.nearestEntity()
      const goal = new goals.GoalFollow(entity, 1)
      assert.ok(!goal.isEnd(bot.entity.position))
      bot.entity.position = targetBlock.clone()
      assert.ok(goal.isEnd(bot.entity.position))
    })
  })
})

describe('pathfinder events', function () {
  const mcData = require('minecraft-data')(Version)

  const targetBlock = new Vec3(12, 1, 8) // a gold block away from the spawn position
  const spawnPos = new Vec3(8.5, 1, 8.5) // Center of the chunk & center of the block

  /** @type { import('mineflayer').Bot & { pathfinder: import('mineflayer-pathfinder').Pathfinder }} */
  let bot
  /** @type { import('minecraft-protocol').Server } */
  let server

  before(async () => {
    server = await newServer(server, targetBlock, spawnPos, Version, true)
    bot = mineflayer.createBot({
      username: 'player',
      version: Version,
      port: 25567
    })
    await once(bot, 'chunkColumnLoad')
    bot.loadPlugin(pathfinder)
    bot.pathfinder.setMovements(new Movements(bot, mcData))
  })
  after(() => server.close())

  describe('events', async function () {
    beforeEach(() => {
      bot.entity.position = spawnPos.clone()
    })
    afterEach((done) => {
      bot.pathfinder.setGoal(null)
      setTimeout(done)
      const listeners = ['goal_reached', 'goal_updated', 'path_update', 'path_stop']
      listeners.forEach(l => bot.removeAllListeners(l))
    })

    it('goal_reached', function (done) {
      this.timeout(3000) // timeout with an error if done() isn't called within one second
      this.slow(1000)
      bot.once('goal_reached', () => done())
      bot.pathfinder.setGoal(new goals.GoalNear(targetBlock.x, targetBlock.y, targetBlock.z, 1))
    })

    it('goal_updated', function (done) {
      this.timeout(100)
      bot.once('goal_updated', () => done())
      bot.pathfinder.setGoal(new goals.GoalNear(targetBlock.x, targetBlock.y, targetBlock.z, 1))
    })

    it('path_update', function (done) {
      this.timeout(3000)
      this.slow(1000)
      bot.pathfinder.setGoal(new goals.GoalNear(targetBlock.x, targetBlock.y, targetBlock.z, 1))
      bot.once('path_update', () => done())
    })

    it('path_stop', function (done) {
      this.timeout(3000)
      this.slow(1000)
      bot.pathfinder.setGoal(new goals.GoalNear(targetBlock.x, targetBlock.y, targetBlock.z, 1))
      bot.once('path_stop', () => done())
      bot.pathfinder.stop()
    })
  })
})
