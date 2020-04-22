const { performance } = require('perf_hooks')

const astar = require('./lib/astar')

var Vec3 = require('vec3').Vec3

const MONITOR_INTERVAL = 40

function inject (bot) {
  bot.pathfinder = {}

  const mcData = require('minecraft-data')(bot.version)

  const scafoldingBlocks = []
  scafoldingBlocks.push(mcData.blocksByName.dirt.id)
  scafoldingBlocks.push(mcData.blocksByName.cobblestone.id)

  bot.pathfinder.scafoldingBlocks = scafoldingBlocks

  function countScaffoldingItems () {
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

  function getScaffoldingItem () {
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
    const maxBlockPlace = countScaffoldingItems()
    const p = bot.entity.position
    const timeout = 10 * 1000 // 10 seconds
    astar({ x: Math.floor(p.x), y: Math.floor(p.y), z: Math.floor(p.z), remainingBlocks: maxBlockPlace }, movements, goal, timeout, done)
  }

  bot.pathfinder.stop = function () {}
  bot.pathfinder.walk = function (path, done) {
    let lastNodeTime = performance.now()
    const monitorInterval = setInterval(monitorMovement, MONITOR_INTERVAL)
    bot.pathfinder.stop('interrupted')
    bot.pathfinder.stop = stop
    let digging = false
    let placing = false

    if (path.length === 0) {
      stop()
    }

    // for (let i in path) {
    //  console.log(JSON.stringify(path[i]));
    // }

    function monitorMovement () {
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
              if (err) bot.pathfinder.stop('cannot dig')
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
          const block = getScaffoldingItem()
          if (!block) {
            bot.pathfinder.stop('no block to place')
            return
          }
          bot.equip(block, 'hand', function () {
            bot.placeBlock(refBlock, new Vec3(b.dx, b.dy, b.dz), function (err) {
              placing = false
              lastNodeTime = performance.now()
              if (err) {
                console.log(err)
                bot.pathfinder.stop('cannot place')
              }
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
        if (path.length === 0) {
          stop() // done
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

      // const leftRightProj = lx * dz - lz * dx
      // TODO: left/right adjustements

      // check for futility
      if (performance.now() - lastNodeTime > 1500) {
        // should never take this long to go to the next node
        stop('obstructed')
      }
    }

    function stop (reason) {
      bot.pathfinder.stop = function () {}
      clearInterval(monitorInterval)
      bot.clearControlStates()
      done(reason)
    }
  }
}

module.exports = inject
