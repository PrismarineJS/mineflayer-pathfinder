const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals: { GoalFollow } } = require('./index')

const bot = mineflayer.createBot({
  host: 'localhost',
  port: 25565,
  username: 'PathBot', // Username must be <= 16 characters
  version: '1.21.11'
})

bot.loadPlugin(pathfinder)

bot.once('spawn', () => {
  console.log('🤖 Bot spawned in the world! Type "come" in Minecraft chat to make me follow you.')

  // Initialize default movements
  const defaultMove = new Movements(bot)

  // Set the movement configurations to use your local modified pathfinder
  bot.pathfinder.setMovements(defaultMove)
})

bot.on('chat', (username, message) => {
  if (username === bot.username) return

  if (message === 'come') {
    const target = bot.players[username]?.entity
    if (!target) {
      bot.chat("I can't see you! Get closer.")
      return
    }

    bot.chat('Following you! Jump over some blocks or jump in water to test me.')

    // Set a dynamic goal to follow the player within 2 blocks
    bot.pathfinder.setGoal(new GoalFollow(target, 2), true)
  }

  if (message === 'stop') {
    bot.pathfinder.stop()
    bot.pathfinder.setGoal(null)
    bot.chat('Stopped following.')
  }
})

// Log errors and kick messages
bot.on('error', console.log)
bot.on('kicked', console.log)
