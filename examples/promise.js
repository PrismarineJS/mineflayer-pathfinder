// This example uses promises instead of events like "goal_reached" for a cleaner look

const mineflayer = require('mineflayer')
const pathfinder = require('mineflayer-pathfinder').pathfinder
const Movements = require('mineflayer-pathfinder').Movements
const { GoalNear } = require('mineflayer-pathfinder').goals
const bot = mineflayer.createBot({ username: 'Player' })

// Load pathfinder
bot.loadPlugin(pathfinder)

bot.once('spawn', () => {
  // Set pathfinder movements
  const defaultMove = new Movements(bot)
  bot.pathfinder.setMovements(defaultMove)

  bot.on('chat', async (username, message) => {
    // If username is the same as the Bot's username, don't continue
    if (username === bot.username) return

    // Only continue when the message is "come"
    if (message === 'come') {
      const target = bot.players[username] ? bot.players[username].entity : null

      // If Player doesn't exist, don't continue
      if (!target) return bot.chat("I don't see you !")

      // Await pathfinder to complete the goal, then move to bot.chat and print "I've arrived !"
      await bot.pathfinder.goto(new GoalNear(target.position.x, target.position.y, target.position.z, 1))
      bot.chat("I've arrived!")
    }
  })
})
