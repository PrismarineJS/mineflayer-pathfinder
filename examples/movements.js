
const mineflayer = require('mineflayer')
const { pathfinder, Movements } = require('mineflayer-pathfinder').pathfinder
const { GoalNear } = require('mineflayer-pathfinder').goals

const bot = mineflayer.createBot({ username: 'Player' })

bot.loadPlugin(pathfinder)

bot.once('spawn', () => {
  const mcData = require('minecraft-data')(bot.version)

  // pathfinder comes with default moves preinitialized (a instance of the movement class)
  // the moves come with default logic, like how much it can fall
  // what blocks are used to scaffold, and what blocks to avoid.

  // To make custom movement edit the movements class.
  const customMoves = new Movements(bot, mcData)
  customMoves.canDig = false
  customMoves.allow1by1towers = false
  customMoves.scafoldingBlocks.push(mcData.itemsByName.stone.id)
  // Thing to note scaffoldingBlocks are an array while other namespaces are usually sets
  customMoves.blocksToAvoid.add(mcData.blocksByName.carrot.id)

  // To initialize the new movements use the .setMovements method.
  bot.pathfinder.setMovements(customMoves)

  bot.on('chat', function (username, message) {
    if (username === bot.username) return

    if (message === 'come') {
      const target = bot.players[username] ? bot.players[username].entity : null
      if (!target) {
        bot.chat('I don\'t see you !')
        return
      }
      const p = target.position

      bot.pathfinder.setGoal(new GoalNear(p.x, p.y, p.z, 1))
    }
  })
})
