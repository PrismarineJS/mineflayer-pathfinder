const mineflayer = require('mineflayer')
const pathfinder = require('../')
const Movements = require('../lib/movements')
const { GoalNear, GoalY } = require('../lib/goals')

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

  bot.on('chat', function (username, message) {
    if (username === bot.username) return

    const target = bot.players[username].entity
    if (message === 'come') {
      const p = target.position

      bot.pathfinder.getPathTo(defaultMove, new GoalNear(p.x, p.y, p.z, 1), function (results) {
        bot.chat('I can get there in ' + results.path.length + ' moves. Computation took ' + results.time.toFixed(2) + ' ms.')
        bot.pathfinder.walk(results.path, function (err) {
          if (err) bot.chat('Problem: ' + err)
          else bot.chat('Here I am !')
        })
      })
    } else if (message.startsWith('gotoy')) {
      const y = parseInt(message.split(' ')[1], 10)

      bot.pathfinder.getPathTo(miningMove, new GoalY(y), function (results) {
        bot.chat('I can get there in ' + results.path.length + ' moves. Computation took ' + results.time.toFixed(2) + ' ms.')
        bot.pathfinder.walk(results.path, function (err) {
          if (err) bot.chat('Problem: ' + err)
          else bot.chat('Here I am !')
        })
      })
    } else if (message === 'stop') {
      bot.pathfinder.stop()
    }
  })
})
