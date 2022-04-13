/* eslint-env mocha */

const mineflayer = require('mineflayer')
const { goals, pathfinder, Movements } = require('mineflayer-pathfinder')
const { Vec3 } = require('vec3')
const mc = require('minecraft-protocol')
const assert = require('assert')
const { v4: uuidv4 } = require('uuid')
const PEntity = require('prismarine-entity')
const { once, on } = require('events')
const { Schematic } = require('prismarine-schematic')
const { promises: fs } = require('fs')
const path = require('path')
const Physics = require('../lib/physics')

const Version = '1.16.5'
const ServerPort = 25567

/**
 * Returns a flat bedrock chunk with a single gold block in it.
 * @param {string} Version version
 * @returns {import('prismarine-chunk').Chunk}
 */
function flatMap (Version) {
  const targetBlock = new Vec3(12, 1, 8) // a gold block away from the spawn position
  const Block = require('prismarine-block')(Version)
  const Chunk = require('prismarine-chunk')(Version)
  const mcData = require('minecraft-data')(Version)
  const chunk = new Chunk()
  chunk.initialize((x, y, z) => {
    if (targetBlock.x === x && targetBlock.y === y && targetBlock.z === z) {
      return new Block(mcData.blocksByName.gold_block.id, 1, 0)
    }
    return y === 0 ? new Block(mcData.blocksByName.bedrock.id, 1, 0) : new Block(mcData.blocksByName.air.id, 1, 0) // Bedrock floor
  })
  return chunk
}

/**
 * Reads the schematic parkour1.schem and returns a chunk containing the schematic content.
 * @param {string} Version version to be used
 * @returns {Promise<import('prismarine-chunk').Chunk>}
 */
async function parkourMap (Version) {
  const pwd = path.join(__dirname, './schematics/parkour1.schem')
  // parkour1.schem is a version 1.12 schematic. If other schematics are used the version has to change here too.
  const readSchem = await Schematic.read(await fs.readFile(pwd), '1.12.2')
  const Block = require('prismarine-block')(Version)
  const Chunk = require('prismarine-chunk')(Version)
  const mcData = require('minecraft-data')(Version)
  const chunk = new Chunk()
  chunk.initialize((x, y, z) => {
    const block = readSchem.getBlock(new Vec3(x, y, z))
    if (block.name === 'air') return null
    // Different versions off schematic are not compatible with each other. Assumes block names between versions stay the same.
    const blockVersion = mcData.blocksByName[block.name]
    if (!blockVersion) return null
    return new Block(blockVersion.id, 1, 0)
  })
  return chunk
}

/**
 * Create a new 1.16 server and handle when clients connect.
 * @param {import('minecraft-protocol').Server} server
 * @param {import('vec3').Vec3} spawnPos
 * @param {string} Version
 * @param {boolean} useLoginPacket
 * @returns {Promise<void>}
 */
async function newServer (server, chunk, spawnPos, Version, useLoginPacket) {
  const mcData = require('minecraft-data')(Version)
  server = mc.createServer({
    'online-mode': false,
    version: Version,
    // 25565 - local server, 25566 - proxy server
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
    const chunk = flatMap(Version)
    server = await newServer(server, chunk, spawnPos, Version, true)
    bot = mineflayer.createBot({
      username: 'player',
      version: Version,
      port: ServerPort
    })
    await once(bot, 'chunkColumnLoad')
  })
  after(() => {
    bot.end()
    bot = null
    server.close()
  })

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

    it('GoalLookAtBlock', () => {
      const breakTarget = targetBlock.clone() // should be a gold block or any other block thats dig able
      const goal = new goals.GoalLookAtBlock(breakTarget, bot.world, { reach: 3 })
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
      const Entity = PEntity(Version)
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
      this.timeout(3000)
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

describe('pathfinder util functions', function () {
  const mcData = require('minecraft-data')(Version)
  const Item = require('prismarine-item')(Version)

  const targetBlock = new Vec3(12, 1, 8) // a gold block away from the spawn position
  const spawnPos = new Vec3(8.5, 1, 8.5) // Center of the chunk & center of the block

  const itemsToGive = [new Item(mcData.itemsByName.diamond_pickaxe.id, 1), new Item(mcData.itemsByName.dirt.id, 64)]

  /** @type { import('mineflayer').Bot & { pathfinder: import('mineflayer-pathfinder').Pathfinder }} */
  let bot
  /** @type { import('minecraft-protocol').Server } */
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
    itemsToGive.forEach(item => {
      const slot = bot.inventory.firstEmptyHotbarSlot()
      bot.inventory.slots[slot] = item
    })
    bot.loadPlugin(pathfinder)
    bot.pathfinder.setMovements(new Movements(bot, mcData))
  })
  after(() => server.close())

  describe('paththing', function () {
    this.afterEach((done) => {
      bot.pathfinder.setGoal(null)
      bot.entity.position = spawnPos.clone()
      bot.stopDigging()
      setTimeout(() => done())
    })

    it('Goto', async function () {
      this.timeout(3000)
      this.slow(1500)
      await bot.pathfinder.goto(new goals.GoalGetToBlock(targetBlock.x, targetBlock.y, targetBlock.z))
    })

    it('isMoving', function (done) {
      bot.pathfinder.setGoal(new goals.GoalGetToBlock(targetBlock.x, targetBlock.y, targetBlock.z))
      const foo = () => {
        if (bot.pathfinder.isMoving()) {
          bot.removeListener('physicTick', foo)
          done()
        }
      }
      bot.on('physicTick', foo)
    })

    // Note: Ordering seams to matter when running the isBuilding test. If run after isMining isBuilding does not seam to work.
    it('isBuilding', function (done) {
      this.timeout(5000)
      this.slow(1500)

      bot.pathfinder.setGoal(new goals.GoalBlock(targetBlock.x, targetBlock.y + 2, targetBlock.z))
      const foo = () => {
        if (bot.pathfinder.isBuilding()) {
          bot.removeListener('physicTick', foo)
          bot.stopDigging()
          done()
        }
      }
      bot.on('physicTick', foo)
    })

    it('isMining', function (done) {
      this.timeout(5000)
      this.slow(1500)

      bot.pathfinder.setGoal(new goals.GoalBlock(targetBlock.x, targetBlock.y, targetBlock.z))
      const foo = () => {
        if (bot.pathfinder.isMining()) {
          bot.removeListener('physicTick', foo)
          bot.stopDigging()
          done()
        }
      }
      bot.on('physicTick', foo)
    })
  })

  it('bestHarvestTool', function () {
    const block = bot.blockAt(targetBlock)
    const tool = bot.pathfinder.bestHarvestTool(block)
    assert.deepStrictEqual(tool, itemsToGive[0])
  })

  it('getPathTo', function () {
    const path = bot.pathfinder.getPathTo(bot.pathfinder.movements, new goals.GoalGetToBlock(targetBlock.x, targetBlock.y, targetBlock.z))
    // All depends on the actually path that gets generated. If target block is moved some were else these values have to change.
    assert.strictEqual(path.status, 'success')
    assert.ok(path.visitedNodes < 5, `Generated path visited nodes to high (${path.visitedNodes} < 5)`)
    assert.ok(path.generatedNodes < 30, `Generated path nodes to high (${path.generatedNodes} < 30)`)
    assert.ok(path.path.length === 3, `Generated path length wrong (${path.path.length} === 3)`)
    assert.ok(path.time < 50, `Generated path took to long (${path.time} < 50)`)
  })
})

describe('pathfinder Movement', function () {
  const mcData = require('minecraft-data')(Version)
  const Item = require('prismarine-item')(Version)
  const Block = require('prismarine-block')(Version)

  const targetBlock = new Vec3(12, 1, 8) // a gold block away from the spawn position
  const spawnPos = new Vec3(8.5, 1, 8.5) // Center of the chunk & center of the block

  /** @type { import('mineflayer').Bot & { pathfinder: import('mineflayer-pathfinder').Pathfinder }} */
  let bot
  /** @type { import('minecraft-protocol').Server } */
  let server
  /** @type { import('mineflayer-pathfinder').Movements } */
  let defaultMovement

  const itemsToGive = [new Item(mcData.itemsByName.diamond_pickaxe.id, 1), new Item(mcData.itemsByName.dirt.id, 64)]

  before(async () => {
    const chunk = flatMap(Version)
    server = await newServer(server, chunk, spawnPos, Version, true)
    bot = mineflayer.createBot({
      username: 'player',
      version: Version,
      port: ServerPort
    })
    await once(bot, 'chunkColumnLoad')
    itemsToGive.forEach(item => {
      const slot = bot.inventory.firstEmptyHotbarSlot()
      bot.inventory.slots[slot] = item
    })
    defaultMovement = new Movements(bot, mcData)
    bot.loadPlugin(pathfinder)
    bot.pathfinder.setMovements(defaultMovement)
  })
  after(() => server.close())

  it('countScaffoldingItems', function () {
    assert.strictEqual(defaultMovement.countScaffoldingItems(), 64)
  })

  it('getScaffoldingItem', function () {
    assert.strictEqual(defaultMovement.getScaffoldingItem(), itemsToGive[1])
  })

  it('getBlock', function () {
    assert.ok(defaultMovement.getBlock(targetBlock, 0, 0, 0).type === mcData.blocksByName.gold_block.id)
  })

  describe('safeToBreak world editing', function () {
    this.afterAll(async () => {
      defaultMovement.canDig = true
      await bot.world.setBlock(targetBlock.offset(1, 0, 0), new Block(mcData.blocksByName.air.id, 0))
    })

    it('safeToBreak', async function () {
      const block = bot.blockAt(targetBlock)
      assert.ok(defaultMovement.safeToBreak(block))
      defaultMovement.canDig = false
      assert.ok(!defaultMovement.safeToBreak(block))
      defaultMovement.canDig = true
      await bot.world.setBlock(targetBlock.offset(1, 0, 0), new Block(mcData.blocksByName.water.id, 0, 0))
      assert.ok(!defaultMovement.safeToBreak(block))
    })
  })

  it('safeOrBreak', function () {
    const block = defaultMovement.getBlock(targetBlock, 0, 0, 0)
    const toBreak = []
    const extraValue = defaultMovement.safeOrBreak(block, toBreak)
    assert.ok(extraValue < 100, `safeOrBreak to high for block (${extraValue} < 100)`)
    assert.ok(toBreak.length === 1, `safeOrBreak toBreak array wrong length ${toBreak.length} (${toBreak.length} === 1)`)
  })

  it('getMoveJumpUp', function () {
    const block = defaultMovement.getBlock(targetBlock, -1, 0, 0)
    const dir = new Vec3(1, 0, 0)
    const neighbors = []
    defaultMovement.getMoveJumpUp(block.position, dir, neighbors)
    assert.ok(neighbors.length === 1, `getMoveJumpUp neighbors not right length (${neighbors.length} === 1)`)
  })

  it('getMoveForward', function () {
    const dir = new Vec3(1, 0, 0)
    const neighbors = []
    defaultMovement.getMoveForward(targetBlock, dir, neighbors)
    assert.ok(neighbors.length === 1, `getMoveForward neighbors not right length (${neighbors.length} === 1)`)
  })

  it('getMoveDiagonal', function () {
    const dir = new Vec3(1, 0, 0)
    const neighbors = []
    defaultMovement.getMoveDiagonal(targetBlock, dir, neighbors)
    assert.ok(neighbors.length === 1, `getMoveDiagonal neighbors not right length (${neighbors.length} === 1)`)
  })

  it('getLandingBlock', function () {
    const node = targetBlock.offset(-1, 3, 0)
    const dir = new Vec3(1, 0, 0)
    const block = defaultMovement.getLandingBlock(node, dir)
    assert.ok(block != null, 'Landing block is null')
    if (!block) return
    assert.ok(block.type === mcData.blocksByName.air.id, `getLandingBlock not the right block (${block.name} === air)`)
    assert.ok(block.position.offset(0, -1, 0).distanceSquared(targetBlock) === 0, `getLandingBlock not landing (${block.position.offset(0, -1, 0).distanceSquared(targetBlock)}) on target block: ${defaultMovement.getBlock(block.position, 0, -1, 0).name}`)
  })

  it('getMoveDropDown', function () {
    const dir = new Vec3(1, 0, 0)
    const neighbors = []
    defaultMovement.getMoveDropDown(targetBlock.offset(-1, 4, 0), dir, neighbors)
    assert.ok(neighbors.length === 1, `getMoveDropDown neighbors not right length (${neighbors.length} === 1)`)
  })

  it('getMoveDown', function () {
    const neighbors = []
    defaultMovement.getMoveDown(targetBlock.offset(0, 4, 0), neighbors)
    assert.ok(neighbors.length === 1, `getMoveDown neighbors not right length (${neighbors.length} === 1)`)
  })

  it('getMoveUp', function () {
    const neighbors = []
    defaultMovement.getMoveUp(targetBlock.offset(0, 1, 0), neighbors)
    assert.ok(neighbors.length === 1, `getMoveUp neighbors not right length (${neighbors.length} === 1)`)
  })

  it('getNeighbors', function () {
    const neighbors = defaultMovement.getNeighbors(targetBlock.offset(0, 1, 0))
    assert.ok(neighbors.length > 0, 'getNeighbors length 0')
  })
})

describe('Parkour path test', function () {
  const mcData = require('minecraft-data')(Version)

  const spawnPos = new Vec3(8.5, 1, 8.5) // Center of the chunk & center of the block

  /** @type { import('mineflayer').Bot & { pathfinder: import('mineflayer-pathfinder').Pathfinder }} */
  let bot
  /** @type { import('minecraft-protocol').Server } */
  let server
  /** @type { import('mineflayer-pathfinder').Movements } */
  let defaultMovement

  const parkourSpawn1 = new Vec3(0.5, 3, 12.5)
  const parkourSpawn2 = new Vec3(5.5, 3, 12.5)

  before(async () => {
    this.timeout(5000)
    const chunk = await parkourMap(Version)
    server = await newServer(server, chunk, spawnPos, Version, true)
    bot = mineflayer.createBot({
      username: 'player',
      version: Version,
      port: ServerPort
    })
    await once(bot, 'chunkColumnLoad')
    defaultMovement = new Movements(bot, mcData)
    bot.loadPlugin(pathfinder)
    bot.pathfinder.setMovements(defaultMovement)
  })
  after(() => server.close())

  it('getMoveParkourForward-1', function () {
    const dirs = [new Vec3(0, 0, 1), new Vec3(0, 0, -1)]
    for (let i = 0; i < dirs.length; i++) {
      const dir = dirs[i] // only 2 dirs as the schematic parkour1.schem only has 2 other blocks to path to.
      const neighbors = []
      defaultMovement.getMoveParkourForward(parkourSpawn1, dir, neighbors)
      assert.ok(neighbors.length === 1, `getMoveParkourForward jump off gold block neighbors not right length (${neighbors.length} === 1)`)
    }
  })

  it('getMoveParkourForward-2', function () {
    const dirs = [new Vec3(1, 0, 0), new Vec3(0, 0, 1), new Vec3(-1, 0, 0), new Vec3(0, 0, -1)]
    for (let i = 0; i < dirs.length; i++) {
      const dir = dirs[i]
      const neighbors = []
      defaultMovement.getMoveParkourForward(parkourSpawn2, dir, neighbors)
      assert.ok(neighbors.length === 1, `getMoveParkourForward jump off gold block neighbors not right length (${neighbors.length} === 1)`)
    }
  })
})

describe('Physics test', function () {
  const mcData = require('minecraft-data')(Version)

  const spawnPos = new Vec3(8.5, 1, 8.5) // Center of the chunk & center of the block

  /** @type { import('mineflayer').Bot & { pathfinder: import('mineflayer-pathfinder').Pathfinder }} */
  let bot
  /** @type { import('minecraft-protocol').Server } */
  let server
  /** @type { import('mineflayer-pathfinder').Movements } */
  let defaultMovement

  const parkourSpawn1 = new Vec3(0.5, 3, 12.5)
  // const parkourSpawn2 = new Vec3(5.5, 3, 12.5)

  before(async () => {
    this.timeout(5000)
    const chunk = await parkourMap(Version)
    server = await newServer(server, chunk, spawnPos, Version, true)
    bot = mineflayer.createBot({
      username: 'player',
      version: Version,
      port: ServerPort
    })
    await once(bot, 'chunkColumnLoad')
    defaultMovement = new Movements(bot, mcData)
    bot.loadPlugin(pathfinder)
    bot.pathfinder.setMovements(defaultMovement)
  })
  after(() => server.close())

  it('simulateUntil', async function () {
    this.slow(1000)
    this.timeout(2000)
    const ticksToSimulate = 10
    const ticksPressForward = 5

    bot.entity.position = parkourSpawn1.clone()
    bot.entity.velocity = new Vec3(0, 0, 0)

    // Wait for the bot to be on the ground so bot.entity.onGround == true
    bot.clearControlStates()
    await once(bot, 'physicTick')
    await once(bot, 'physicTick')

    const physics = new Physics(bot)

    const simulatedSteps = []
    const realSteps = []

    const controller = (state, counter) => {
      state.control.forward = counter <= ticksPressForward
      state.control.jump = counter <= ticksPressForward
      simulatedSteps.push(state.pos.toString() + ' Input:' + String(counter <= ticksPressForward))
    }
    const state = physics.simulateUntil(() => false, controller, ticksToSimulate)
    simulatedSteps.push(state.pos.toString() + ' Input:false')

    // We have to be carful to not mess up the event scheduling. for await on(bot, 'physicTick') seams to work.
    // A for loop with just await once(bot, 'physicTick') does not always seam to work. What also works is attaching
    // a listener to bot with bot.on('physicTick', listener) but this is a lot nicer.
    let tick = 0
    for await (const _ of on(bot, 'physicTick')) { // eslint-disable-line no-unused-vars
      bot.setControlState('forward', tick <= ticksPressForward)
      bot.setControlState('jump', tick <= ticksPressForward)
      realSteps.push(bot.entity.position.toString() + ' Input:' + String(tick <= ticksPressForward))
      tick++
      if (tick > ticksToSimulate) break
    }

    bot.clearControlStates()
    // console.info(bot.entity.position.toString(), console.info(state.pos.toString()))
    assert.ok(bot.entity.position.distanceSquared(state.pos) < 0.01,
      `Simulated states don't match Bot: ${bot.entity.position.toString()} !== Simulation: ${state.pos.toString()}`
      // + '\nSimulated Steps:\n'
      // + simulatedSteps.join('\n') + '\n'
      // + 'Real steps:\n'
      // + realSteps.join('\n')
    )
  })

  // TODO: write test for simulateUntilNextTick
})
