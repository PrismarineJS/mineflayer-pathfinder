/*
 * This example shows the usage of the
 * GoalCompositeAny and GoalCompositeAll
 * goals for mineflayer-pathfinder
 *
 * See a more detailed explanation here:
 * https://github.com/PrismarineJS/mineflayer-pathfinder/blob/master/examples/tutorial/goalsExplained.md
 *
 * Made by Jovan04 06/07/2023
*/

// import mineflayer & related libraries
const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals: { GoalNear, GoalCompositeAny, GoalCompositeAll } } = require('mineflayer-pathfinder')

// create mineflayer bot
const bot = mineflayer.createBot({
  host: 'localhost',
  port: 25565,
  version: '1.18.2',
  auth: 'offline',
  username: 'biffed'
})

// load pathfinder plugin and set our bot's Movements
bot.once('spawn', () => {
  bot.loadPlugin(pathfinder)
  bot.pathfinder.setMovements(new Movements(bot))
})

bot.on('chat', async (username, message) => {
  if (username === bot.username) return

  // create three separate GoalNear goals at different locations, with a range of 5; the bot needs to be within 5 blocks of a given goal to satisfy it
  const LapisGoal = new GoalNear(0, 1, 3, 5)
  const GoldGoal = new GoalNear(3, 1, -2, 5)
  const DiamondGoal = new GoalNear(-3, 1, -2, 5)

  const goalsArray = [LapisGoal, GoldGoal, DiamondGoal]

  if (message === 'GoalCompositeAny') {
    bot.chat('Traveling with GoalCompositeAny')
    // create a new GoalCompositeAny: see documentation for a more detailed explanation
    const goalAny = new GoalCompositeAny(goalsArray)
    // and travel to it
    await bot.pathfinder.goto(goalAny)
    bot.chat('Done traveling with GoalCompositeAny')
  }

  if (message === 'GoalCompositeAll') {
    bot.chat('Traveling with GoalCompositeAll')
    // create a new GoalCompositeAll: see documentation for a more detailed explanation
    const goalAll = new GoalCompositeAll(goalsArray)
    // and travel to it
    await bot.pathfinder.goto(goalAll)
    bot.chat('Done traveling with GoalCompositeAll')
  }
})
