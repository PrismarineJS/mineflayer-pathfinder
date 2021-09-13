/* eslint-env mocha */

const mineflayer = require('mineflayer')
const { goals } = require('mineflayer-pathfinder')
const { Vec3 } = require('vec3')
const mc = require('minecraft-protocol')
const assert = require('assert')

describe('pathfinder Goals', function () {
  const Version = '1.16.4'
  const Block = require('prismarine-block')(Version)
  const Chunk = require('prismarine-chunk')(Version)
  const mcData = require('minecraft-data')(Version)
  let bot
  let server
  before((done) => {
    server = mc.createServer({
      'online-mode': false,
      version: Version,
      // 25565 - local server, 25566 - proxy server
      port: 25567
    })
    server.on('listening', () => {
      bot = mineflayer.createBot({
        username: 'player',
        version: Version,
        port: 25567
      })
    })
    server.on('login', (client) => {
      const chunk = new Chunk()
      chunk.initialize((x, y, z) => {
        if (x === 2 && y === 1 && z === 0) {
          return new Block(mcData.blocksByName.gold_block.id, 1, 0)
        }
        return y === 0 ? new Block(mcData.blocksByName.bedrock.id, 1, 0) : new Block(0, 1, 0)
      })
      let loginPacket
      if (bot.supportFeature('usesLoginPacket')) {
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

      setTimeout(done, 100)
    })
  })

  describe('Goals', async () => {
    const targetBlock = new Vec3(2, 1, 0) // a gold block
    const start = new Vec3(0, 1, 0)
    beforeEach(() => {
      bot.entity.position = start.clone()
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
      const goalComposite = new goals.GoalCompositeAny([goal1, goal2])
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
      const goalComposite = new goals.GoalCompositeAll([goal1, goal2])
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
  })
})
