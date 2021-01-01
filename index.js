const { performance } = require('perf_hooks')

const AStar = require('./lib/astar')
const Move = require('./lib/move')
const Movements = require('./lib/movements')
const gotoUtil = require('./lib/goto')

const Vec3 = require('vec3').Vec3

const Physics = require('./lib/physics')
const nbt = require('prismarine-nbt')

function inject (bot) {
  const mcData = require('minecraft-data')(bot.version)
  const waterType = mcData.blocksByName.water.id
  let stateMovements = new Movements(bot, mcData)
  let stateGoal = null
  let astarContext = null
  let astartTimedout = false
  let dynamicGoal = false
  let path = []
  let pathUpdated = false
  let digging = false
  let placing = false
  let placingBlock = null
  let lastNodeTime = performance.now()
  const physics = new Physics(bot)

  bot.pathfinder = {}

  bot.pathfinder.thinkTimeout = 5000 // ms
  bot.pathfinder.enablePathShortcut = false // disabled by default as it can cause bugs in specific configurations

  bot.pathfinder.bestHarvestTool = (block) => {
    const availableTools = bot.inventory.items()
    const effects = bot.entity.effects

    let fastest = Number.MAX_VALUE
    let bestTool = null
    for (const tool of availableTools) {
      const enchants = (tool && tool.nbt) ? nbt.simplify(tool.nbt).Enchantments : []
      const digTime = block.digTime(tool ? tool.type : null, false, false, false, enchants, effects)
      if (digTime < fastest) {
        fastest = digTime
        bestTool = tool
      }
    }

    return bestTool
  }

  bot.pathfinder.getPathTo = (movements, goal, timeout) => {
    const p = bot.entity.position
    const dy = p.y - Math.floor(p.y)
    const b = bot.blockAt(p)
    const start = new Move(p.x, p.y + (b && dy > 0.001 && b.type !== 0 ? 1 : 0), p.z, movements.countScaffoldingItems(), 0)
    astarContext = new AStar(start, movements, goal, timeout || bot.pathfinder.thinkTimeout)
    const result = astarContext.compute()
    result.path = postProcessPath(result.path)
    return result
  }

  Object.defineProperties(bot.pathfinder, {
    goal: {
      get () {
        return stateGoal
      }
    },
    movements: {
      get () {
        return stateMovements
      }
    }
  })

  function resetPath (clearStates = true) {
    path = []
    if (digging) bot.stopDigging()
    digging = false
    placing = false
    pathUpdated = false
    astarContext = null
    if (clearStates) bot.clearControlStates()
  }

  bot.pathfinder.setGoal = (goal, dynamic = false) => {
    stateGoal = goal
    dynamicGoal = dynamic
    bot.emit('goal_updated', goal, dynamic)
    resetPath()
  }

  bot.pathfinder.setMovements = (movements) => {
    stateMovements = movements
    resetPath()
  }

  bot.pathfinder.isMoving = () => path.length > 0
  bot.pathfinder.isMining = () => digging
  bot.pathfinder.isBuilding = () => placing

  bot.pathfinder.goto = (goal, cb) => {
    gotoUtil(bot, goal, cb)
  }

  bot.on('physicTick', monitorMovement)

  function postProcessPath (path) {
    for (const nextPoint of path) {
      const b = bot.blockAt(new Vec3(nextPoint.x, nextPoint.y, nextPoint.z))
      if (b && b.type === waterType) {
        nextPoint.x = Math.floor(nextPoint.x) + 0.5
        nextPoint.y = Math.floor(nextPoint.y)
        nextPoint.z = Math.floor(nextPoint.z) + 0.5
        continue
      }
      let np = getPositionOnTopOf(b)
      if (np === null) np = getPositionOnTopOf(bot.blockAt(new Vec3(nextPoint.x, nextPoint.y - 1, nextPoint.z)))
      if (np) {
        nextPoint.x = np.x
        nextPoint.y = np.y
        nextPoint.z = np.z
      } else {
        nextPoint.x = Math.floor(nextPoint.x) + 0.5
        nextPoint.y = nextPoint.y - 1
        nextPoint.z = Math.floor(nextPoint.z) + 0.5
      }
    }

    if (!bot.pathfinder.enablePathShortcut || path.length === 0) return path

    const newPath = []
    let lastNode = bot.entity.position
    for (let i = 1; i < path.length; i++) {
      const node = path[i]
      if (Math.abs(node.y - lastNode.y) > 0.5 || node.toBreak.length > 0 || node.toPlace.length > 0 || !physics.canStraightLineBetween(lastNode, node)) {
        newPath.push(path[i - 1])
        lastNode = path[i - 1]
      }
    }
    newPath.push(path[path.length - 1])
    return newPath
  }

  function pathFromPlayer (path) {
    let minI = 0
    let minDistance = 1000
    for (let i = 0; i < path.length; i++) {
      const node = path[i]
      const dist = bot.entity.position.distanceSquared(node)
      if (dist < minDistance) {
        minDistance = dist
        minI = i
      }
    }
    // check if we are between 2 nodes
    let next = 0
    if (minI + 1 < path.length) {
      const n1 = path[minI]
      const n2 = path[minI + 1]
      const d2 = bot.entity.position.distanceSquared(n2)
      const d12 = n1.distanceSquared(n2)
      next = d12 > d2 ? 1 : 0
    }
    path.splice(0, minI + next)
  }

  function isPositionNearPath (pos, path) {
    for (const node of path) {
      const dx = Math.abs(node.x - pos.x - 0.5)
      const dy = Math.abs(node.y - pos.y - 0.5)
      const dz = Math.abs(node.z - pos.z - 0.5)
      if (dx <= 1 && dy <= 2 && dz <= 1) return true
    }
    return false
  }

  // Return the average x/z position of the highest standing positions
  // in the block.
  function getPositionOnTopOf (block) {
    if (!block || block.shapes.length === 0) return null
    const p = new Vec3(0.5, 0, 0.5)
    let n = 1
    for (const shape of block.shapes) {
      const h = shape[4]
      if (h === p.y) {
        p.x += (shape[0] + shape[3]) / 2
        p.z += (shape[2] + shape[5]) / 2
        n++
      } else if (h > p.y) {
        n = 2
        p.x = 0.5 + (shape[0] + shape[3]) / 2
        p.y = h
        p.z = 0.5 + (shape[2] + shape[5]) / 2
      }
    }
    p.x /= n
    p.z /= n
    return block.position.plus(p)
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

  function moveToEdge(block, edge) {
    //TODO should be replaced with sneak when it is implemented in prismarine-physics
    const maxMovement = 0.2
    const noneFalloffDistance = .58
    const targetPos = block.clone().offset(.5, 0, .5).offset(edge.x * noneFalloffDistance, 1, edge.z * noneFalloffDistance)
    if (bot.entity.position.distanceTo(targetPos) > 0.001) {
      const targetVec = targetPos.clone().subtract(bot.entity.position).normalize()
      if (maxMovement * maxMovement < bot.entity.position.distanceSquared(targetPos)) {
        targetVec.scale(maxMovement)
      } else {
        targetVec.scale(bot.entity.position.distanceTo(targetPos))
      }
      bot.entity.position.add(targetVec)
      return false
    }
    return true
  }

  bot.on('blockUpdate', (oldBlock, newBlock) => {
    if (isPositionNearPath(oldBlock.position, path) && oldBlock.type !== newBlock.type) {
      resetPath(false)
    }
  })

  bot.on('chunkColumnLoad', (chunk) => {
    resetPath(false)
  })

  function monitorMovement () {
    // Test freemotion
    if (stateMovements && stateMovements.allowFreeMotion && stateGoal && stateGoal.entity) {
      const target = stateGoal.entity
      if (physics.canStraightLine(target.position)) {
        bot.lookAt(target.position.offset(0, 1.6, 0))

        if (target.position.distanceSquared(bot.entity.position) > stateGoal.rangeSq) {
          bot.setControlState('forward', true)
        } else {
          bot.clearControlStates()
        }
        return
      }
    }

    if (stateGoal && stateGoal.hasChanged()) {
      resetPath(false)
    }

    if (path.length === 0) {
      lastNodeTime = performance.now()
      if (stateGoal && stateMovements) {
        if (stateGoal.isEnd(bot.entity.position.floored()) || pathUpdated) {
          if (!dynamicGoal) {
            bot.emit('goal_reached', stateGoal)
            stateGoal = null
            fullStop()
          }
        } else {
          const results = bot.pathfinder.getPathTo(stateMovements, stateGoal)
          bot.emit('path_update', results)
          path = results.path
          astartTimedout = results.status === 'partial'
          pathUpdated = true
        }
      }
    } else if (astarContext && astartTimedout) {
      const results = astarContext.compute()
      results.path = postProcessPath(results.path)
      pathFromPlayer(results.path)
      bot.emit('path_update', results)
      path = results.path
      astartTimedout = results.status === 'partial'
    }

    if (path.length === 0) {
      return
    }

    let nextPoint = path[0]
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
      const block = stateMovements.getScaffoldingItem()
      if (!block) {
        resetPath()
        return
      }
      if (placingBlock.y === bot.entity.position.floored().y - 1) {
        if (!moveToEdge(new Vec3(placingBlock.x, placingBlock.y, placingBlock.z), new Vec3(placingBlock.dx, 0, placingBlock.dz))) return
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

    let dx = nextPoint.x - p.x
    const dy = nextPoint.y - p.y
    let dz = nextPoint.z - p.z
    if ((dx * dx + dz * dz) <= (0.15 * 0.15) && ((bot.entity.onGround && Math.abs(dy) < 1) || bot.entity.isInWater)) {
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
      dx = nextPoint.x - p.x
      dz = nextPoint.z - p.z
    }

    bot.look(Math.atan2(-dx, -dz), 0)
    bot.setControlState('forward', true)
    bot.setControlState('jump', false)

    if (bot.entity.isInWater) {
      bot.setControlState('jump', true)
      bot.setControlState('sprint', false)
    } else if (stateMovements.allowSprinting && bot.entity.onGround && physics.canStraightLine(path, true)) {
      bot.setControlState('jump', false)
      bot.setControlState('sprint', true)
    } else if (stateMovements.allowSprinting && bot.entity.onGround && physics.canSprintJump(path)) {
      bot.setControlState('jump', true)
      bot.setControlState('sprint', true)
    } else if (physics.canStraightLine(path)) {
      bot.setControlState('jump', false)
      bot.setControlState('sprint', false)
    } else if (bot.entity.onGround && physics.canWalkJump(path)) {
      bot.setControlState('jump', true)
      bot.setControlState('sprint', false)
    } else if (!bot.entity.onGround || !physics.simulateUntilNextTick().onGround) {
      bot.setControlState('forward', false)
      bot.setControlState('sprint', false)
    } else {
      bot.setControlState('sprint', false)
    }

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
