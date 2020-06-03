const { performance } = require('perf_hooks')

const astar = require('./lib/astar')

const Vec3 = require('vec3').Vec3

const THINK_TIMEOUT = 100 // ms

function inject (bot) {
  bot.pathfinder = {}

  const mcData = require('minecraft-data')(bot.version)

  const scafoldingBlocks = []
  scafoldingBlocks.push(mcData.blocksByName.dirt.id)
  scafoldingBlocks.push(mcData.blocksByName.cobblestone.id)

  bot.pathfinder.scafoldingBlocks = scafoldingBlocks

  bot.pathfinder.countScaffoldingItems = function () {
    let count = 0
    const items = bot.inventory.items()
    for (const i in scafoldingBlocks) {
      const id = scafoldingBlocks[i]
      for (const j in items) {
        const item = items[j]
        if (item.type === id) count += item.count
      }
    }
    return count
  }

  bot.pathfinder.getScaffoldingItem = function () {
    const items = bot.inventory.items()
    for (const i in scafoldingBlocks) {
      const id = scafoldingBlocks[i]
      for (const j in items) {
        const item = items[j]
        if (item.type === id) return item
      }
    }
    return null
  }

  bot.pathfinder.bestHarvestTool = function (block) {
    const items = bot.inventory.items()
    for (const i in block.harvestTools) {
      const id = parseInt(i, 10)
      for (const j in items) {
        const item = items[j]
        if (item.type === id) return item
      }
    }
    return null
  }

  bot.pathfinder.getPathTo = function (movements, goal, done, timeout) {
    const maxBlockPlace = bot.pathfinder.countScaffoldingItems()
    const p = bot.entity.position
    astar({ x: Math.floor(p.x), y: Math.floor(p.y), z: Math.floor(p.z), remainingBlocks: maxBlockPlace }, movements, goal, timeout || THINK_TIMEOUT, done)
  }

  let stateMovements = null
  let stateGoal = null
  let dynamicGoal = false
  let path = []
  let pathUpdated = false
  let digging = false
  let placing = false
  let placingBlock = null
  let thinking = false
  let lastNodeTime = performance.now()

  function resetPath () {
    path = []
    if (digging) bot.stopDigging()
    digging = false
    placing = false
    pathUpdated = false
    bot.clearControlStates()
  }

  bot.pathfinder.setGoal = function (goal, dynamic = false) {
    stateGoal = goal
    dynamicGoal = dynamic
    resetPath()
  }

  bot.pathfinder.setMovements = function (movements) {
    stateMovements = movements
    resetPath()
  }

  bot.on('physicTick', monitorMovement)

  function isPositionNearPath (pos, path) {
    for (const i in path) {
      const node = path[i]
      const dx = Math.abs(node.x - pos.x)
      const dy = Math.abs(node.y - pos.y)
      const dz = Math.abs(node.z - pos.z)
      if (dx <= 3 && dy <= 3 && dz <= 3) return true
    }
    return false
  }

  function fullStop () {
    bot.clearControlStates()

    // Force horizontal velocity to 0 (otherwise inertia can move us too far)
    // Kind of cheaty, but the server will not tell the difference
    bot.entity.velocity.x = 0
    bot.entity.velocity.z = 0

    const blockX = Math.floor(bot.entity.position.x) + 0.5
    const blockZ = Math.floor(bot.entity.position.z) + 0.5

    // Make sure our bounding box don't collide with neighboring blocks
    // otherwise recenter the position
    if (Math.abs(bot.entity.position.x - blockX) > 0.2) { bot.entity.position.x = blockX }
    if (Math.abs(bot.entity.position.z - blockZ) > 0.2) { bot.entity.position.z = blockZ }
  }

  bot.on('blockUpdate', (oldBlock, newBlock) => {
    if (isPositionNearPath(oldBlock.position, path) && oldBlock.type !== newBlock.type) {
      resetPath()
    }
  })

  function monitorMovement () {
    if (stateGoal && stateGoal.hasChanged()) {
      resetPath()
    }

    if (path.length === 0) {
      lastNodeTime = performance.now()
      if (stateGoal && stateMovements && !thinking) {
        if (stateGoal.isEnd(bot.entity.position.floored())) {
          if (!dynamicGoal) {
            bot.emit('goal_reached', stateGoal)
            stateGoal = null
          }
        } else if (!pathUpdated) {
          thinking = true
          bot.pathfinder.getPathTo(stateMovements, stateGoal, (results) => {
            bot.emit('path_update', results)
            path = results.path
            thinking = false
            pathUpdated = true
          })
        }
      }
      return
    }

    let nextPoint = path[0]
    bot.physics.adjustPositionHeight(nextPoint)
    const p = bot.entity.position

    // Handle digging
    if (digging || nextPoint.toBreak.length > 0) {
      if (!digging && bot.entity.onGround) {
        digging = true
        const b = nextPoint.toBreak.shift()
        const block = bot.blockAt(new Vec3(b.x, b.y, b.z), false)
        const tool = bot.pathfinder.bestHarvestTool(block)
        fullStop()
        bot.equip(tool, 'hand', function () {
          bot.dig(block, function (err) {
            lastNodeTime = performance.now()
            if (err) resetPath()
            digging = false
          })
        })
      }
      return
    }
    // Handle block placement
    // TODO: sneak when placing or make sure the block is not interactive
    if (placing || nextPoint.toPlace.length > 0) {
      if (!placing) {
        placing = true
        placingBlock = nextPoint.toPlace.shift()
        fullStop()
      }
      const block = bot.pathfinder.getScaffoldingItem()
      if (!block) {
        resetPath()
        return
      }
      let canPlace = true
      if (placingBlock.jump) {
        bot.setControlState('jump', true)
        canPlace = placingBlock.y + 1 < bot.entity.position.y
      }
      if (canPlace) {
        bot.equip(block, 'hand', function () {
          const refBlock = bot.blockAt(new Vec3(placingBlock.x, placingBlock.y, placingBlock.z), false)
          bot.placeBlock(refBlock, new Vec3(placingBlock.dx, placingBlock.dy, placingBlock.dz), function (err) {
            placing = false
            lastNodeTime = performance.now()
            if (err) resetPath()
          })
        })
      }
      return
    }

    const dx = nextPoint.x - p.x
    const dy = nextPoint.y - p.y
    const dz = nextPoint.z - p.z
    if ((dx * dx + dz * dz) <= 0.15 * 0.15 && (bot.entity.onGround || bot.entity.isInWater)) {
      // arrived at next point
      lastNodeTime = performance.now()
      path.shift()
      if (path.length === 0) { // done
        if (!dynamicGoal && stateGoal.isEnd(p.floored())) {
          bot.emit('goal_reached', stateGoal)
          stateGoal = null
        }
        fullStop()
        return
      }
      // not done yet
      nextPoint = path[0]
      if (nextPoint.toBreak.length > 0 || nextPoint.toPlace.length > 0) {
        fullStop()
        return
      }
    }
    let gottaJump = false
    const horizontalDelta = Math.sqrt(dx * dx + dz * dz)

    if (dy > 0.6) {
      // gotta jump up when we're close enough
      gottaJump = horizontalDelta < 1.75
    } else if (dy < -0.1) {
      // possibly jump over a hole
      gottaJump = horizontalDelta > 1.5 && horizontalDelta < 2.5
    }
    gottaJump = gottaJump || bot.entity.isInWater
    bot.setControlState('jump', gottaJump)

    // run toward next point
    bot.look(Math.atan2(-dx, -dz), 0)

    const lx = -Math.sin(bot.entity.yaw)
    const lz = -Math.cos(bot.entity.yaw)

    const frontBackProj = lx * dx + lz * dz
    bot.setControlState('forward', frontBackProj > 0)
    bot.setControlState('back', frontBackProj < 0)

    // check for futility
    if (performance.now() - lastNodeTime > 1500) {
      // should never take this long to go to the next node
      resetPath()
    }
  }
}

module.exports = {
  pathfinder: inject,
  Movements: require('./lib/movements'),
  goals: require('./lib/goals')
}
