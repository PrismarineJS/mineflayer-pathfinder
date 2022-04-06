/* Pathfinder Chaining Goals example

This example shows how to chain goals together.
Run this example with:

node examples/chaining-goals.js [host] [port] [mail/username] [is online `true`]

If you want to connect to an offline server use a username instead of an email
and no password. If you want to join a online server use your email and follow
the instructions in the command line to authenticated with microsoft auth.

In Game Chat commands:
come
  - Path finds to the chatting player's position when in render distance.

follow
  - Follows the chatting player's entity until `stop` is chatted

stop
  - Stops the bot from following or path finding

point
  - Set a checkpoint at the chatting player's position

walk
  - Walk to all set checkpoints
*/

// Import all the modules we need
const mineflayer = require('mineflayer')
const { pathfinder, Movements } = require('mineflayer-pathfinder')
const {
  GoalNear, GoalBlock, GoalFollow
} = require('mineflayer-pathfinder').goals

if (process.argv.length > 6) {
  console.log('Usage : node chaining-goals.js [<host>] [<port>] ' +
    '[<microsoft email/name>] [<is online `true`>]')
  process.exit(1)
}

// Create the bot
const bot = mineflayer.createBot({
  host: process.argv[2] || 'localhost',
  port: parseInt(process.argv[3]) || 25565,
  username: process.argv[4] || 'checkpointBot',
  // to join offline servers auth type has to be 'mojang' (???)
  auth: process.argv[5] === 'true' ? 'microsoft' : 'mojang',
  // Skip validation when joining a offline server
  skipValidation: process.argv[5] !== 'true'
})

// Load the pathfinder plugin
bot.loadPlugin(pathfinder)

// Wait for the bot to spawn in the world
bot.once('spawn', () => {
  // Once we've spawn, it is safe to access mcData because we know the version
  const mcData = require('minecraft-data')(bot.version)

  // We create different movement generators for different type of activity
  const defaultMove = new Movements(bot, mcData)
  bot.pathfinder.setMovements(defaultMove)

  // Print debug messages when the path changes
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

  let checkpoints = []

  // Make pathfinder walk to all checkpoints in order
  async function walkCheckpoints () {
    if (checkpoints.length === 0) {
      bot.chat('There are no checkpoints')
      return
    }

    // Remove all checkpoints when starting to walking
    const checkPointCopy = [...checkpoints]
    checkpoints = []
    for (const checkpoint of checkPointCopy) {
      // Make a new goal to goto. GoalBlock will make the bot walk to the
      // block position off checkpoint.
      const goal = new GoalBlock(checkpoint.x, checkpoint.y, checkpoint.z)
      try {
        // Use await to make sure the bot is at the checkpoint before moving on
        await bot.pathfinder.goto(goal)
      } catch (error) {
        console.log('Got error from goto', error.message)
        // If we get an error we quit the loop
        return
      }
    }
  }

  // Listen for chat messages chatted by other players
  // Note: This may not work on every server as mineflayer uses regex to match
  // chat messages. Some servers may use chat messages that do not match the
  // regex.
  bot.on('chat', (username, message) => {
    if (username === bot.username) return // Ignore our own messages

    // Get the player entity from the username.
    // Note: This might not work on some servers where the players nametag name
    // dose not match the chat message name.
    const target = bot.players[username] ? bot.players[username].entity : null
    if (message === 'come') {
      if (!target) {
        bot.chat('I don\'t see you !')
        return
      }
      const p = target.position

      bot.pathfinder.setGoal(new GoalNear(p.x, p.y, p.z, 1))
    } else if (message === 'follow') {
      bot.pathfinder.setGoal(new GoalFollow(target, 3), true)
      // follow is a dynamic goal: setGoal(goal, dynamic=true)
      // when reached, the goal will stay active and will not
      // emit an event
    } else if (message === 'stop') {
      bot.pathfinder.stop() // Also resets the current goal
    } else if (message === 'point') {
      if (!target) {
        bot.chat('I don\'t see you !')
        return
      }
      const pos = target.position.floored()
      checkpoints.push(pos)
      bot.chat(`Checkpoint ${pos} set`)
    } else if (message === 'walk') {
      walkCheckpoints()
        .then(() => {
          bot.chat('Done')
        })
        .catch(console.error)
    }
  })
})
