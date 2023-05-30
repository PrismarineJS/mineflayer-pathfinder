/*
 * This example demonstrates how easy it is to change the default movement
 *
 * Below are a few options you can edit in the Movement Class
 * but remember to check out the API documentation to find even more!
 *
 * This bot also follows a player when called called out to it.
 */

const mineflayer = require('mineflayer')
const { pathfinder, Movements } = require('mineflayer-pathfinder')
const { GoalNear } = require('mineflayer-pathfinder').goals

const bot = mineflayer.createBot({
  host: process.argv[2],
  port: parseInt(process.argv[3]),
  username: process.argv[4] ? process.argv[4] : 'movementsbot',
  password: process.argv[5]
})

bot.loadPlugin(pathfinder)

bot.once('spawn', () => {
  /*
   * pathfinder comes with default moves preinitialized (a instance of the movement class)
   * the moves come with default logic, like how much it can fall
   * what blocks are used to scaffold, and what blocks to avoid.
   */

  // To get started create a instance of the Movements class
  const customMoves = new Movements(bot)
  // To make changes to the behaviour, customize the properties of the instance
  customMoves.canDig = false
  customMoves.allow1by1towers = false
  customMoves.scafoldingBlocks.push(bot.registry.itemsByName.stone.id)
  // Thing to note scaffoldingBlocks are an array while other namespaces are usually sets
  customMoves.blocksToAvoid.add(bot.registry.blocksByName.carrot.id)

  // To initialize the new movements use the .setMovements method.
  bot.pathfinder.setMovements(customMoves)

  bot.on('chat', function (username, message) {
    if (username === bot.username) return

    if (message === 'come') {
      const target = bot.players[username]?.entity
      if (!target) {
        bot.chat('I don\'t see you !')
        return
      }
      const p = target.position

      bot.pathfinder.setGoal(new GoalNear(p.x, p.y, p.z, 1))
    }
  })
})
