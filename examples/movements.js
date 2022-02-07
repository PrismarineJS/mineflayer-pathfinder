
const mineflayer = require('mineflayer')
const { pathfinder, Movements } = require('mineflayer-pathfinder').pathfinder
const { GoalNear } = require('mineflayer-pathfinder').goals

const bot = mineflayer.createBot({ username: 'Player' })

bot.loadPlugin(pathfinder)

bot.once('spawn', () => {

  const mcData = require('minecraft-data')(bot.version)

  // pathfinder comes with default moves preinitialized (a instance of the movement class)
  // the moves come with default ligic, like how much it can fall
  // what blocks are used to scafold, and what blocks to avoid.

  // To make custom movement edit the movements class.
  const customMoves = new Movements(bot, mcData)
  customMoves.canDig = false; 
  customMoves.allow1by1towers = false;
  customMoves.scafoldingBlocks.push(mcData.itemsByName.stone.id);
  // thing to note scafoldingBlocks are an array while other namespases are usuallys sets
  customMoves.blocksToAvoid.add(mcData.blocksByname.carrot.id);

  // To initialize the new movements use the .setMovements method. 
  bot.pathfinder.setMovements(defaultMove)
  
  bot.on('chat', function(username, message) {
  
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
