const mineflayer = require('mineflayer')
const { pathfinder, Movements } = require('mineflayer-pathfinder')
const { GoalInvert, GoalFollow } = require('mineflayer-pathfinder').goals

mineflayer.multiple = (bots, constructor) => {
  const { Worker, isMainThread, workerData } = require('worker_threads')
  if (isMainThread) {
    const threads = []
    for (const i in bots) {
      threads.push(new Worker(__filename, { workerData: bots[i] }))
    }
  } else {
    constructor(workerData)
  }
}

const bots = []
for (let i = 0; i < 40; i++) {
  bots.push({ username: `Bot${i}` })
}

mineflayer.multiple(bots, ({ username }) => {
  const bot = mineflayer.createBot({ username, viewDistance: 'tiny' })

  bot.loadPlugin(pathfinder)

  bot.once('spawn', () => {
    // We create different movement generators for different type of activity
    const defaultMove = new Movements(bot)
    defaultMove.allowFreeMotion = true
    bot.pathfinder.searchRadius = 10

    bot.on('path_update', (results) => {
      console.log('[' + username + '] I can get there in ' + results.path.length + ' moves. Computation took ' + results.time.toFixed(2) + ' ms.')
    })

    bot.on('goal_reached', (goal) => {
      console.log('[' + username + '] Here I am !')
    })

    bot.on('chat', (username, message) => {
      if (username === bot.username) return

      const target = bot.players[username].entity
      if (message === 'follow') {
        bot.pathfinder.setMovements(defaultMove)
        bot.pathfinder.setGoal(new GoalFollow(target, 5), true)
      } else if (message === 'avoid') {
        bot.pathfinder.setMovements(defaultMove)
        bot.pathfinder.setGoal(new GoalInvert(new GoalFollow(target, 5)), true)
      } else if (message === 'stop') {
        bot.pathfinder.setGoal(null)
      }
    })
  })
})
