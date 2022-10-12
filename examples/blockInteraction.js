const mineflayer = require('mineflayer')
const { pathfinder, Movements } = require('mineflayer-pathfinder')
const { GoalNear, GoalBlock, GoalXZ, GoalY, GoalFollow, GoalPlaceBlock, GoalLookAtBlock } = require('mineflayer-pathfinder').goals
const Vec3 = require('vec3').Vec3

if (process.argv.length > 6) {
  console.log('Usage : node blockInteraction.js [<host>] [<port>] [<name>] [<password>]')
  process.exit(1)
}

const bot = mineflayer.createBot({
  host: process.argv[2] || 'localhost',
  port: parseInt(process.argv[3]) || 25565,
  username: process.argv[4] || 'blockPlacer',
  password: process.argv[5]
})

bot.once('spawn', () => {
  console.info('Joined the server')

  bot.loadPlugin(pathfinder)
  const defaultMove = new Movements(bot)
  bot.pathfinder.setMovements(defaultMove)

  bot.on('chat', async (username, message) => {
    const target = bot.players[username].entity

    if (message.startsWith('place')) {
      const [, itemName] = message.split(' ')
      if (!target) {
        bot.chat('I can\'t see you')
        return
      }
      const itemsInInventory = bot.inventory.items().filter(item => item.name.includes(itemName))
      if (itemsInInventory.length === 0) {
        bot.chat('I dont have ' + itemName)
        return
      }

      try {
        const rayBlock = rayTraceEntitySight(target)
        if (!rayBlock) {
          bot.chat('Block is out of reach')
          return
        }
        const face = directionToVector(rayBlock.face)
        await bot.pathfinder.goto(new GoalPlaceBlock(rayBlock.position.offset(face.x, face.y, face.z), bot.world, {
          range: 4
        }))
        await bot.equip(itemsInInventory[0], 'hand')
        await bot.lookAt(rayBlock.position.offset(face.x * 0.5 + 0.5, face.y * 0.5 + 0.5, face.z * 0.5 + 0.5))
        await bot.placeBlock(rayBlock, face)
      } catch (e) {
        console.error(e)
      }
    } else if (message.startsWith('break')) {
      if (!target) {
        bot.chat('I can\'t see you')
        return
      }

      try {
        const rayBlock = rayTraceEntitySight(target)
        if (!rayBlock) {
          bot.chat('Block is out of reach')
          return
        }
        await bot.pathfinder.goto(new GoalLookAtBlock(rayBlock.position, bot.world, { range: 4 }))
        const bestHarvestTool = bot.pathfinder.bestHarvestTool(bot.blockAt(rayBlock.position))
        if (bestHarvestTool) await bot.equip(bestHarvestTool, 'hand')
        await bot.dig(bot.blockAt(rayBlock.position), true, 'raycast')
      } catch (e) {
        console.error(e)
      }
    } else if (message === 'come') {
      if (!target) {
        bot.chat('I don\'t see you !')
        return
      }
      const p = target.position

      bot.pathfinder.setMovements(defaultMove)
      bot.pathfinder.setGoal(new GoalNear(p.x, p.y, p.z, 1))
    } else if (message === 'stop') {
      bot.pathfinder.stop()
    } else if (message === 'follow') {
      bot.pathfinder.setMovements(defaultMove)
      bot.pathfinder.setGoal(new GoalFollow(target, 1), true)
      // follow is a dynamic goal: setGoal(goal, dynamic=true)
      // when reached, the goal will stay active and will not
      // emit an event
    } else if (message.startsWith('goto')) {
      const cmd = message.split(' ')

      if (cmd.length === 4) { // goto x y z
        const x = parseInt(cmd[1], 10)
        const y = parseInt(cmd[2], 10)
        const z = parseInt(cmd[3], 10)

        bot.pathfinder.setMovements(defaultMove)
        bot.pathfinder.setGoal(new GoalBlock(x, y, z))
      } else if (cmd.length === 3) { // goto x z
        const x = parseInt(cmd[1], 10)
        const z = parseInt(cmd[2], 10)

        bot.pathfinder.setMovements(defaultMove)
        bot.pathfinder.setGoal(new GoalXZ(x, z))
      } else if (cmd.length === 2) { // goto y
        const y = parseInt(cmd[1], 10)

        bot.pathfinder.setMovements(defaultMove)
        bot.pathfinder.setGoal(new GoalY(y))
      }
    }
  })

  const rayTraceEntitySight = function (entity) {
    if (bot.world?.raycast) {
      const { height, position, yaw, pitch } = entity
      const x = -Math.sin(yaw) * Math.cos(pitch)
      const y = Math.sin(pitch)
      const z = -Math.cos(yaw) * Math.cos(pitch)
      const rayBlock = bot.world.raycast(position.offset(0, height, 0), new Vec3(x, y, z), 120)
      if (rayBlock) {
        return rayBlock
      }
    } else {
      throw Error('bot.world.raycast does not exists. Try updating prismarine-world.')
    }
  }
})

bot.on('error', console.error)
bot.on('kicked', console.error)

function directionToVector (dir) {
  if (dir > 5 || dir < 0) return null
  if (dir === 0) {
    return new Vec3(0, -1, 0)
  } else if (dir === 1) {
    return new Vec3(0, 1, 0)
  } else if (dir === 2) {
    return new Vec3(0, 0, -1)
  } else if (dir === 3) {
    return new Vec3(0, 0, 1)
  } else if (dir === 4) {
    return new Vec3(-1, 0, 0)
  } else if (dir === 5) {
    return new Vec3(1, 0, 0)
  }
}
