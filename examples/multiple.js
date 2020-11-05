const mineflayer = require('mineflayer')
const { goals, pathfinder, Movements } = require('mineflayer-pathfinder')

const multiple = (bots, constructor) => {
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

multiple(bots, ({ username }) => {
  const bot = mineflayer.createBot({ username })

  bot.loadPlugin(pathfinder)

  bot.once('spawn', () => {
    // We create different movement generators for different types of activity
    const defaultMove = new Movements(bot)
    defaultMove.allowFreeMotion = true

    const log = info => console.log(`[${username}] ${info}`)

    bot.on('path_update', ({ path, time }) =>
      log(
        `I can get there in ${
          path.length
        } moves. Computation took ${time.toFixed(2)} ms.`
      )
    )

    bot.on('goal_reached', () => log("I'm here!"))

    bot.on('chat', (username, message) => {
      if (username === bot.username) return

      const target = bot.players[username].entity
      if (message === 'follow') {
        bot.pathfinder.setMovements(defaultMove)
        bot.pathfinder.setGoal(new goals.GoalFollow(target, 5), true)
      } else if (message === 'avoid') {
        bot.pathfinder.setMovements(defaultMove)
        bot.pathfinder.setGoal(
          new goals.GoalInvert(new goals.GoalFollow(target, 5)),
          true
        )
      } else if (message === 'stop') {
        bot.pathfinder.setGoal(null)
      }
    })
  })
})
