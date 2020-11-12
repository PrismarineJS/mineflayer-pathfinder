# Mineflayer-pathfinder

[![npm version](https://badge.fury.io/js/mineflayer-pathfinder.svg)](https://badge.fury.io/js/mineflayer-pathfinder) ![npm](https://img.shields.io/npm/dt/mineflayer-pathfinder) [![Try it on gitpod](https://img.shields.io/badge/try-on%20gitpod-brightgreen.svg)](https://gitpod.io/#https://github.com/Karang/mineflayer-pathfinder)

Pathfinding plugin. This is still a work in progress, feel free to contribute by making suggestions.

## Install

```bash
npm install mineflayer-pathfinder
```

## Video Tutorial

For a video tutorial explaining the usage of mineflayer-pathfinder, you can watch the following Youtube videos:

[part 1](https://www.youtube.com/watch?v=UWGSf08wQSc)

[part 2](https://www.youtube.com/watch?v=ssWE0kXDGJE)

## Example

```js
const mineflayer = require('mineflayer')
const pathfinder = require('mineflayer-pathfinder').pathfinder
const Movements = require('mineflayer-pathfinder').Movements
const { GoalNear } = require('mineflayer-pathfinder').goals
const bot = mineflayer.createBot({ username: 'Player' })

bot.loadPlugin(pathfinder)

bot.once('spawn', () => {

  const mcData = require('minecraft-data')(bot.version)

  const defaultMove = new Movements(bot, mcData)
  
  bot.on('chat', function(username, message) {
  
    if (username === bot.username) return

    const target = bot.players[username] ? bot.players[username].entity : null
    if (message === 'come') {
      if (!target) {
        bot.chat('I don\'t see you !')
        return
      }
      const p = target.position

      bot.pathfinder.setMovements(defaultMove)
      bot.pathfinder.setGoal(new GoalNear(p.x, p.y, p.z, 1))
    } 
})
```

## Features
 * Optimized and modernized A* pathfinding
 * Complexe goals can be specified (inspired by [baritone goals](https://github.com/cabaletta/baritone/blob/master/FEATURES.md#goals) )
 * Customizable movements generator
 * Each movement can have a different cost
 * Can break/place blocks as part of its deplacement
 * Automatically update path when environment change
 * Long distance paths
 * Can swim

## TODO
* Make computations span multiple ticks
* Ladders and vines
* Parkour jumps
* Limit search range
* Make a modular api to configure the movements
* Dynamic enemies avoidance
* Dynamic harvest/mining paths
* Sprint
* Actual move speed per block

## API
Considering there are a lot of deep changes that are being worked on, it could take some time before it's done

Also, **for now**, there is only the `pathfinder` module, `movements` and `goals` still need to be done


# Functions:

### bot.pathfinder.bestHarvestTool(block)
Returns the best harvest tool in the inventory for the specified block
 * `Returns` - ?
 * `block` - Block instance

### bot.pathfinder.getPathTo(movements, goal, done, timeout)
Returns a Path instance
 * `Returns` - void
 * `movments` - Movements instance
 * `goal` - Goal instance
 * `done` - ?
 * `timeout` - (optional, default `bot.pathfinder.thinkTimeout`) number

### bot.pathfinder.setGoal(Goal, dynamic)
 * `goal` - Goal instance
 * `dynamic` - (optional, default false) boolean
 
### bot.pathfinder.setMovements(movements)
Assigns the movements config
 * `movments` - Movements instance

### bot.pathfinder.isMoving()
A function that checks if the bot is currently moving.
 * `Returns` - boolean

### bot.pathfinder.isMining()
A function that checks if the bot is currently mining blocks.
 * `Returns` - boolean

### bot.pathfinder.isBuilding()
A function that checks if the bot is currently placing blocks.
 * `Returns` - boolean

### bot.pathfinder.isThinking()
A function that returns true if a path is currently being calculated. False otherwise.
 * `Returns` - boolean

# Properties:
### bot.pathfinder.thinkTimeout
Think Timeout in milliseconds
 * `Default` - 40

# Events:

### goal_reached
Called when the goal has been reached. Is not called for dynamic goals.

### path_update
Called whenever the path is recalculated.

### goal_updated
Called whenever a new goal is assigned to the pathfinder.
