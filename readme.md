# Mineflayer-pathfinder

[![npm version](https://badge.fury.io/js/mineflayer-pathfinder.svg)](https://badge.fury.io/js/mineflayer-pathfinder) ![npm](https://img.shields.io/npm/dt/mineflayer-pathfinder) [![Try it on gitpod](https://img.shields.io/badge/try-on%20gitpod-brightgreen.svg)](https://gitpod.io/#https://github.com/PrismarineJS/mineflayer-pathfinder) [![Issue Hunt](https://github.com/BoostIO/issuehunt-materials/blob/master/v1/issuehunt-shield-v1.svg)](https://issuehunt.io/r/PrismarineJS/mineflayer-pathfinder)

Pathfinding plugin. This is still a work in progress, feel free to contribute by making suggestions.

## Install

```bash
npm install mineflayer-pathfinder
```

## Video Tutorial

For a video tutorial explaining the usage of mineflayer-pathfinder, you can watch the following Youtube videos:

[<img src="https://img.youtube.com/vi/UWGSf08wQSc/0.jpg" alt="part 1" width="200">](https://www.youtube.com/watch?v=UWGSf08wQSc)
[<img src="https://img.youtube.com/vi/ssWE0kXDGJE/0.jpg" alt="part 2" width="200">](https://www.youtube.com/watch?v=ssWE0kXDGJE)

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

## API
Considering there are a lot of deep changes that are being worked on, it could take some time before it's done

Also, **for now**, there is only the `pathfinder` module, `movements` and `goals` still need to be done


# Functions:

### bot.pathfinder.goto(goal, callback?)
Returns a Promise. Resolves when the goal is reached. Rejects on error.
 * `goal` - Goal instance
 * `callback` `<function>` - (Optional) The callback is passed two arguments `(err, result)`, where error is `null` on success.


### bot.pathfinder.bestHarvestTool(block)
Returns the best harvest tool in the inventory for the specified block
 * `Returns` - `Item` instance or `null`
 * `block` - Block instance

### bot.pathfinder.getPathTo(movements, goal, done, timeout)
 * `Returns` - The path
 * `movements` - Movements instance
 * `goal` - Goal instance
 * `timeout` - number (optional, default `bot.pathfinder.thinkTimeout`)

### bot.pathfinder.setGoal(Goal, dynamic)
 * `goal` - Goal instance
 * `dynamic` - boolean (optional, default false)
 
### bot.pathfinder.setMovements(movements)
Assigns the movements config
 * `movements` - Movements instance

### bot.pathfinder.stop()
Stops path finding when its save to stop or after the bot encountered an error while path finding. To force stop use bot.pathfinder.setGoal(null). Emits `path_stop` when stopped.

### bot.pathfinder.isMoving()
A function that checks if the bot is currently moving.
 * `Returns` - boolean

### bot.pathfinder.isMining()
A function that checks if the bot is currently mining blocks.
 * `Returns` - boolean

### bot.pathfinder.isBuilding()
A function that checks if the bot is currently placing blocks.
 * `Returns` - boolean

# Properties:
### bot.pathfinder.thinkTimeout
Think Timeout in milliseconds
 * `Default` - `5000`

### bot.pathfinder.tickTimeout
How many ms per tick are allocated to thinking
 * `Default` - `40`

### bot.pathfinder.searchRadius
The search limiting radius, in blocks, if `-1` the search is not limited by distance.
 * `Default` - `-1`

# Movement class
This class configures how pathfinder plans its paths. It configures things like block breaking or different costs for moves. This class can be extended to add or change how pathfinder calculates its moves.

## Usage
Pathfinder instantiates the default movement class by itself if no instance is specified. If you want to change values you should create a new instance of the Movements class, change it's values and set it as pathfinders new movement class. 
### Example:
```js
const { Movements } = require('mineflayer-pathfinder') // Import the Movements class from pathfinder

bot.once('spawn', () => {
  // Once we've spawn, it is safe to access mcData because we know the version
  const mcData = require('minecraft-data')(bot.version)

  // A new movement instance for specific behavior
  const defaultMove = new Movements(bot, mcData)

  defaultMove.allow1by1towers = false // Do not build 1x1 towers when going up
  defaultMove.canDig = false // Disable breaking of blocks when pathing 
  defaultMove.scafoldingBlocks.push(mcData.itemsByName['netherrack'].id) // Add nether rack to allowed scaffolding items
  bot.pathfinder.setMovements(defaultMove) // Update the movement instance pathfinder uses

  // Do pathfinder things
  // ...
})
```

## Movements class default properties
Movement class properties and there default values.
### canDig
Boolean to allow breaking blocks
* Default `true`

### digCost
Additional cost for breaking blocks.
* Default - `1`

### placeCost
Additional cost for placing blocks.
* Default - `1`

### maxDropDown
Max drop down distance. Only considers drops that have blocks to land on.
* Default - `4`

### liquidCost
Additional cost for interacting with liquids.
* Default - `1`

### dontCreateFlow
Do not break blocks that touch liquid blocks.
* Default - `true`

### allow1by1towers
Allow pillaring up on 1x1 towers.
* Default - `true`

### allowFreeMotion
Allow to walk to the next node/goal in a strait line if terrain allows it.
* Default - `false`

### allowParkour
Allow parkour jumps like jumps over gaps bigger then 1 block
* Default - `true`

### allowSprinting
Allow sprinting when moving.
* Default - `true`

### blocksCantBreak
Set of block id's pathfinder cannot break. Includes chests wheat and all unbreakable blocks.
* instance of `Set`

### blocksToAvoid
Set of block id's to avoid.
* instance of `Set`

### liquids
Set of liquid block id's.
* instance of `Set`

### climbables
Set of block id's that are climable. Note: Currently unused as pathfinder cannot use climables.
* instance of `Set`

### replaceables
Set of block id's that can be replaced when placing blocks.
* instance of `Set`

### scafoldingBlocks
Array of item id's that can be used as scaffolding blocks.
* Default - `[<scaffoldingItems>]`

### fences
Set of block id's that are fences or blocks that have a collision box taler then 1 block.
* instance of `Set`

### carpets
Set of all carpet block id's or blocks that have a collision box smaller then 0.1. These blocks are considered save to walk in.
* instance of `Set`

# Events:

### goal_reached
Called when the goal has been reached. Is not called for dynamic goals.

### path_update
Called whenever the path is recalculated. Status may be:
 * `success` a path has been found
 * `partial` a partial path has been found, computations will continue next tick
 * `timeout` timed out
 * `noPath` no path was found

### goal_updated
Called whenever a new goal is assigned to the pathfinder.

### path_reset
Called when the path is reset, with a reason:
 * `goal_updated`
 * `movements_updated`
 * `block_updated`
 * `chunk_loaded`
 * `goal_moved`
 * `dig_error`
 * `no_scaffolding_blocks`
 * `place_error`
 * `stuck`

 ### path_stop
 Called when the pathing has been stopped by `bot.pathfinder.stop()`

# Goals:

### GoalBlock(x, y, z)
One specific block that the player should stand inside at foot level
 * `x` - Integer
 * `y` - Integer
 * `z` - Integer

### GoalNear(x, y, z, range)
A block position that the player should get within a certain radius of
 * `x` - Integer
 * `y` - Integer
 * `z` - Integer
 * `range` - Integer
 
### GoalXZ(x, z)
Useful for long-range goals that don't have a specific Y level
 * `x` - Integer
 * `z` - Integer

### GoalNearXZ(x, z, range)
Useful for finding builds that you don't have an exact Y level for, just an approximate X and Z level
 * `x` - Integer
 * `z` - Integer
 * `range` - Integer

### GoalY(y)
Get to y level
 * `y` - Integer


### GoalGetToBlock(x, y, z)
Don't get into the block, but get directly adjacent to it. Useful for chests.
 * `x` - Integer
 * `y` - Integer
 * `z` - Integer

### GoalCompositeAny(Array\<Goal>?)
A composite of many goals, any one of which satisfies the composite.
For example, a GoalCompositeAny of block goals for every oak log in loaded
chunks would result in it pathing to the easiest oak log to get to
 * `Array` - Array of goals

### GoalCompositeAll(Array\<Goal>?)
A composite of many goals, all of them needs to be satisfied.
 * `Array` - Array of goals

### GoalInvert(goal)
Inverts the goal
 * `goal` - Goal to invert

### GoalFollow(entity, range)
Follows an entity
 * `entity` - Entity instance
 * `range` - Integer

### GoalPlaceBlock(pos, world, options)
Position the bot in order to place a block
 * `pos` - Vec3 the position of the placed block
 * `world` - the world of the bot
 * `options` - object containing all optionals properties:
   * `range` - maximum distance from the clicked face
   * `faces` - the directions of the faces the player can click
   * `facing` - the direction the player must be facing
   * `facing3D` - boolean, facing is 3D (true) or 2D (false)
   * `half` - `top` or `bottom`, the half that must be clicked
   
 ### GoalBreakBlock(x, y, z, bot, { range = 5 })
 Path into a position were a blockface of block at x y z is visible. Fourth argument is optional and contains options. `range` option defaults to 4.
