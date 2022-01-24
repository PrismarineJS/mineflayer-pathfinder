/* Pathfinder Exclusion Area example

This example shows the use of exclusion areas with the Movement Class.

In Game Chat commands:
come
  - Path finds to the chatting player's position when in render distance.
exclude this (break | step | place) <radius>
  - Exclude a spherical area off size <radius> of type break, step or place at the chatting
  player's position  when in render distance
goto (x y z) | (x z) | y
  - Goto a specific coordinate
follow
  - Follows the chatting player's entity until stop is chatted
stop
  - Stops the bot from following or path finding
*/

const mineflayer = require('mineflayer')
const { pathfinder, Movements } = require('mineflayer-pathfinder')
const { GoalNear, GoalBlock, GoalXZ, GoalY, GoalFollow } = require('mineflayer-pathfinder').goals

if (process.argv.length > 6) {
  console.log('Usage : node example.js [<host>] [<port>] [<name>] [<password>]')
  process.exit(1)
}

const bot = mineflayer.createBot({
  host: process.argv[2] || 'localhost',
  port: parseInt(process.argv[3]) || 25565,
  username: process.argv[4] || 'exclusionAreaBot',
  password: process.argv[5]
})

bot.loadPlugin(pathfinder)

bot.once('spawn', () => {
  // Once we've spawn, it is safe to access mcData because we know the version
  const mcData = require('minecraft-data')(bot.version)

  // We create different movement generators for different type of activity
  const defaultMove = new Movements(bot, mcData)
  bot.pathfinder.setMovements(defaultMove)

  bot.on('path_update', (r) => {
    const nodesPerTick = (r.visitedNodes * 50 / r.time).toFixed(2)
    console.log(`I can get there in ${r.path.length} moves. ` +
      `Computation took ${r.time.toFixed(2)} ms (${r.visitedNodes} nodes` +
      `, ${nodesPerTick} nodes/tick)`)
  })

  bot.on('goal_reached', (goal) => {
    console.log('Here I am !')
  })

  bot.on('path_reset', (reason) => {
    console.log(`Path was reset for reason: ${reason}`)
  })

  bot.on('chat', (username, message) => {
    if (username === bot.username) return

    const target = bot.players[username] ? bot.players[username].entity : null
    if (message === 'come') {
      if (!target) {
        bot.chat('I don\'t see you !')
        return
      }
      const p = target.position

      bot.pathfinder.setGoal(new GoalNear(p.x, p.y, p.z, 1))
    } else if (message.startsWith('exclude')) {
      const cmd = message.split(' ')
      if (cmd[1] === 'this') {
        if (!target) {
          bot.chat('I can\'t see you')
          return
        }
        const type = cmd[2].trim()
        if (!['break', 'step', 'place'].includes(type.toLowerCase())) {
          return bot.chat('type must be "break", "step" or "place"')
        }
        const radius = Number(cmd[3])
        const center = target.position.floored()
        if (isNaN(radius)) return bot.chat('Radius must be a number')
        // Import typings for intellisense
        /**
         * @param {import('mineflayer-pathfinder').SafeBlock} block block */
        const isExcluded = (block) => {
          return block.position.distanceTo(center) <= radius ? 0 : 100
        }
        switch (type.toLowerCase()) {
          case 'step':
            bot.pathfinder.movements.exclusionAreasStep.push(isExcluded)
            break
          case 'break':
            bot.pathfinder.movements.exclusionAreasBreak.push(isExcluded)
            break
          case 'place':
            bot.pathfinder.movements.exclusionAreasPlace.push(isExcluded)
            break
        }
        // At 5. The bot avoids the area most of the time but can still move into and out of it.
        bot.pathfinder.movements.exclusionAreaPower = 5
        bot.pathfinder.setMovements(bot.pathfinder.movements)
        bot.chat(`Added exclusion area circle around ${center.toString()} with radius ${radius}`)
      } else {
        bot.chat('Usage: exclude this (break | step | place) <radius>')
      }
    } else if (message.startsWith('goto')) {
      const cmd = message.split(' ')

      if (cmd.length === 4) { // goto x y z
        const x = parseInt(cmd[1], 10)
        const y = parseInt(cmd[2], 10)
        const z = parseInt(cmd[3], 10)

        bot.pathfinder.setGoal(new GoalBlock(x, y, z))
      } else if (cmd.length === 3) { // goto x z
        const x = parseInt(cmd[1], 10)
        const z = parseInt(cmd[2], 10)

        bot.pathfinder.setGoal(new GoalXZ(x, z))
      } else if (cmd.length === 2) { // goto y
        const y = parseInt(cmd[1], 10)

        bot.pathfinder.setGoal(new GoalY(y))
      }
    } else if (message === 'follow') {
      bot.pathfinder.setGoal(new GoalFollow(target, 3), true)
      // follow is a dynamic goal: setGoal(goal, dynamic=true)
      // when reached, the goal will stay active and will not
      // emit an event
    } else if (message === 'stop') {
      bot.pathfinder.stop() // Also resets the current goal
    }
  })
})
