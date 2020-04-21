const { performance } = require('perf_hooks')

const astar = require('./lib/astar')

var Vec3 = require('vec3').Vec3

const MONITOR_INTERVAL = 40

function inject (bot) {
  bot.pathfinder = {}

  const mcData = require('minecraft-data')(bot.version)
  const movements = require('./lib/movements')(bot, mcData)

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

  bot.pathfinder.getPathTo = function (goal, done) {
    const maxBlockPlace = countScaffoldingItems()
    const p = bot.entity.position
    const timeout = 2 * 1000 // 2 seconds
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
          bot.clearControlStates()
          bot.dig(block, function (err) {
            digging = false
            lastNodeTime = performance.now()
            if (err) bot.pathfinder.stop('cannot dig')
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
      if ((dx * dx + dy * dy + dz * dz) <= 0.2 * 0.2) {
        // arrived at next point
        lastNodeTime = performance.now()
        path.shift()
        if (path.length === 0) {
          stop() // done
          return
        }
        // not done yet
        nextPoint = path[0]
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
      bot.setControlState('forward', true)

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
