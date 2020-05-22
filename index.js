const { performance } = require('perf_hooks')

const astar = require('./lib/astar')

var Vec3 = require('vec3').Vec3

const MONITOR_INTERVAL = 40 // ms
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

  bot.pathfinder.getPathTo = function (movements, goal, done) {
    const maxBlockPlace = bot.pathfinder.countScaffoldingItems()
    const p = bot.entity.position
    astar({ x: Math.floor(p.x), y: Math.floor(p.y), z: Math.floor(p.z), remainingBlocks: maxBlockPlace }, movements, goal, THINK_TIMEOUT, done)
  }

  let stateMovements = null
  let stateGoal = null
  let dynamicGoal = false
  let path = []
  let digging = false
  let placing = false
  let thinking = false
  let lastNodeTime = performance.now()

  bot.pathfinder.setGoal = function (goal, dynamic = false) {
    stateGoal = goal
    dynamicGoal = dynamic
    path = []
  }

  bot.pathfinder.setMovements = function (movements) {
    stateMovements = movements
    path = []
  }

  let monitorInterval = setInterval(monitorMovement, MONITOR_INTERVAL)
  bot.on('end', () => {
    clearInterval(monitorInterval)
    monitorInterval = null
  })

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

  bot.on('blockUpdate', (oldBlock, newBlock) => {
    if (isPositionNearPath(oldBlock.position, path)) {
      path = []
    }
  })

  function monitorMovement () {
    if (stateGoal && stateGoal.hasChanged()) {
      path = []
    }

    if (path.length === 0) {
      lastNodeTime = performance.now()
      if (stateGoal && stateMovements && !stateGoal.isEnd(bot.entity.position.floored()) && !thinking) {
        thinking = true
        bot.pathfinder.getPathTo(stateMovements, stateGoal, (results) => {
          bot.emit('path_update', results)
          path = results.path
          thinking = false
        })
      }
      return
    }

    let nextPoint = path[0]
    const p = bot.entity.position

    // Handle digging
    if (digging || nextPoint.toBreak.length > 0) {
      if (!digging) {
        const b = nextPoint.toBreak.shift()
        const block = bot.blockAt(new Vec3(b.x, b.y, b.z))
        const tool = bot.pathfinder.bestHarvestTool(block)
        bot.clearControlStates()
        bot.equip(tool, 'hand', function () {
          bot.dig(block, function (err) {
            digging = false
            lastNodeTime = performance.now()
            if (err) path = []
          })
        })
        digging = true
      }
      return
    }
    // Handle block placement
    // TODO: better bot placement before trying to place block
    // TODO: sneak when placing or make sure the block is not interactive
    if (placing || nextPoint.toPlace.length > 0) {
      if (!placing) {
        const b = nextPoint.toPlace.shift()
        const refBlock = bot.blockAt(new Vec3(b.x, b.y, b.z))
        bot.clearControlStates()
        const block = bot.pathfinder.getScaffoldingItem()
        if (!block) {
          path = []
          return
        }
        bot.equip(block, 'hand', function () {
          bot.placeBlock(refBlock, new Vec3(b.dx, b.dy, b.dz), function (err) {
            placing = false
            lastNodeTime = performance.now()
            if (err) path = []
          })
        })
        placing = true
      }
      return
    }

    const dx = nextPoint.x - p.x
    const dy = nextPoint.y - p.y
    const dz = nextPoint.z - p.z
    if ((dx * dx + dz * dz) <= 0.15 * 0.15 && Math.abs(dy) < 0.002) {
      // arrived at next point
      lastNodeTime = performance.now()
      path.shift()
      if (path.length === 0) { // done
        if (!dynamicGoal && stateGoal.isEnd(p.floored())) {
          bot.emit('goal_reached', stateGoal)
          stateGoal = null
        }
        bot.clearControlStates()
        return
      }
      // not done yet
      nextPoint = path[0]
      if (nextPoint.toBreak.length > 0 || nextPoint.toPlace.length > 0) {
        bot.clearControlStates()
        return
      }
    }
    let gottaJump = false
    const horizontalDelta = Math.abs(dx + dz)

    if (dy > 0.1) {
      // gotta jump up when we're close enough
      gottaJump = horizontalDelta < 1.75
    } else if (dy < -0.1) {
      // possibly jump over a hole
      gottaJump = horizontalDelta > 1.5 && horizontalDelta < 2.5
    }
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
      path = []
    }
  }
}

module.exports = inject
