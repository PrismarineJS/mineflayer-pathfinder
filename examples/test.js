const mineflayer = require('mineflayer')
const pathfinder = require('../')
const Movements = require('../lib/movements')
const { GoalNear, GoalBlock, GoalXZ, GoalY } = require('../lib/goals')

const bot = mineflayer.createBot({
  username: 'Bot'
})

bot.loadPlugin(pathfinder)

bot.once('spawn', () => {
  // Once we've spawn, it is safe to access mcData because we know the version
  const mcData = require('minecraft-data')(bot.version)

  // We create different movement generators for different type of activity
  const defaultMove = new Movements(bot, mcData)

  const miningMove = new Movements(bot, mcData)
  miningMove.digCost = 0

  bot.on('path_update', (results) => {
    bot.chat('I can get there in ' + results.path.length + ' moves. Computation took ' + results.time.toFixed(2) + ' ms.')
  })

  bot.on('goal_reached', (goal) => {
    bot.chat('Here I am !')
  })

  bot.on('chat', (username, message) => {
    if (username === bot.username) return

    const target = bot.players[username].entity
    if (message === 'come') {
      if (!target) {
        bot.chat('I don\'t see you !')
        return
      }
      const p = target.position

      bot.pathfinder.setMovements(defaultMove)
      bot.pathfinder.setGoal(new GoalNear(p.x, p.y, p.z, 1))
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

        bot.pathfinder.setMovements(miningMove)
        bot.pathfinder.setGoal(new GoalY(y))
      }
    }
  })
})
