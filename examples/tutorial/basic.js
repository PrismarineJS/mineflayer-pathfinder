/*
 * This example shows the usage of the GoalBlock
 * goal for mineflayer-pathfinder
 *
 * See a more detailed explanation here:
 * https://github.com/PrismarineJS/mineflayer-pathfinder/blob/master/examples/tutorial/goalsExplained.md
 *
 * Made by Jovan04 06/07/2023
*/

const mineflayer = require('mineflayer') // import mineflayer, pathfinder, the Movements class, and our goal(s)
const { pathfinder, Movements, goals: { GoalBlock } } = require('mineflayer-pathfinder')

const bot = mineflayer.createBot({ // create our bot
  host: 'localhost',
  port: 25565,
  username: 'Pathfinder',
  auth: 'offline'
})

bot.once('spawn', () => {
  bot.loadPlugin(pathfinder) // load pathfinder plugin into the bot
  const defaultMovements = new Movements(bot) // create a new instance of the `Movements` class
  bot.pathfinder.setMovements(defaultMovements) // set the bot's movements to the `Movements` we just created
})

bot.on('chat', async (username, message) => {
  if (username === bot.username) return // make bot ignore its own messages

  if (message === 'go') { // this is our trigger message (only works on servers with vanilla chat)
    bot.chat('Going to my goal!')
    const myGoal = new GoalBlock(15, 3, 75)
    await bot.pathfinder.goto(myGoal)
    bot.chat('Arrived at my goal!')
  }
})
