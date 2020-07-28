// Simple test to evaluate how much time it takes to find a path of 100 blocks

const mineflayer = require('mineflayer')
const { pathfinder, Movements } = require('mineflayer-pathfinder')
const { GoalXZ } = require('mineflayer-pathfinder').goals
const { performance } = require('perf_hooks')

const bot = mineflayer.createBot({
  username: 'Bot'
})

bot.loadPlugin(pathfinder)

const createTime = performance.now()
bot.once('spawn', () => {
  console.log('Spawning took ' + (performance.now() - createTime).toFixed(2) + ' ms.')

  const mcData = require('minecraft-data')(bot.version)

  const defaultMove = new Movements(bot, mcData)
  const goal = new GoalXZ(bot.entity.position.x + 100, bot.entity.position.z)
  bot.pathfinder.getPathTo(defaultMove, goal, (results) => {
    console.log('I can get there in ' + results.path.length + ' moves. Computation took ' + results.time.toFixed(2) + ' ms.')
    bot.quit()
    process.exit()
  }, 10000)
})
