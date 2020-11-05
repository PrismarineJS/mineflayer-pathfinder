// Simple test to evaluate how much time it takes to find a path of 100 blocks

const mineflayer = require('mineflayer')
const { goals, pathfinder, Movements } = require('mineflayer-pathfinder')
const { performance } = require('perf_hooks')

if (process.argv.length > 6) {
  console.log('Usage : node bench.js [<host>] [<port>] [<name>] [<password>]')
  process.exit(1)
}

const bot = mineflayer.createBot({
  host: process.argv[2] || 'localhost',
  port: parseInt(process.argv[3]) || 25565,
  username: process.argv[4] || 'bench',
  password: process.argv[5]
})

bot.loadPlugin(pathfinder)

const createTime = performance.now()
bot.once('spawn', () => {
  console.log(
    `Spawning took ${(performance.now() - createTime).toFixed(2)} ms.`
  )

  const mcData = require('minecraft-data')(bot.version)

  const defaultMove = new Movements(bot, mcData)
  const goal = new goals.GoalXZ(
    bot.entity.position.x + 100,
    bot.entity.position.z
  )
  bot.pathfinder.getPathTo(
    defaultMove,
    goal,
    ({ path, time }) => {
      console.log(
        `I can get there in ${
          path.length
        } moves. Computation took ${time.toFixed(2)} ms.`
      )
      bot.quit()
      process.exit()
    },
    10000
  )
})
