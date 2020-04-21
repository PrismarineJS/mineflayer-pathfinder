const mineflayer = require('mineflayer')
const pathfinder = require('../')
const { GoalNear } = require('../lib/goals')

const bot = mineflayer.createBot({
  username: 'Bot'
})

bot.loadPlugin(pathfinder)

bot.on('chat', function (username, message) {
  if (username === bot.username) return

  const target = bot.players[username].entity
  if (message === 'come') {
    const p = target.position

    bot.pathfinder.getPathTo(new GoalNear(p.x, p.y, p.z, 1), function (results) {
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
