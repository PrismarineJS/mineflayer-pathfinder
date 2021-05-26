const mineflayer = require('mineflayer')
const { pointer } = require('mineflayer-pointer')
const { pathfinder, Movement, goals } = require('../index')

const bot = mineflayer.createBot({
  username: 'bridger',
  version: '1.16.5'
})

bot.on('spawn', () => {
  bot.loadPlugins([pathfinder, pointer])
  const defaultMovement = new Movement(bot, require('minecraft-data')(bot.version))
  bot.pathfinder.setMovements(defaultMovement)
})

bot.on('chat', (username, message) => {
  if (username === bot.username) return
  if (message === 'come') {
    const target = bot.players[username] || null
    if (!target) return bot.chat("Can't see you")
    const p = bot.players[username].entity.position
    bot.pathfinder.setGoal(new goals.GoalNear(p.x, p.y, p.z, 1))
  }
})
