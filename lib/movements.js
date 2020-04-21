
var Vec3 = require('vec3').Vec3

function makeGetNeighbors (bot, mcData) {
  const blocksCanBreak = new Set()
  blocksCanBreak.add(mcData.blocksByName.grass_block.id)
  blocksCanBreak.add(mcData.blocksByName.dirt.id)
  blocksCanBreak.add(mcData.blocksByName.oak_leaves.id)
  blocksCanBreak.add(mcData.blocksByName.spruce_leaves.id)
  blocksCanBreak.add(mcData.blocksByName.birch_leaves.id)
  blocksCanBreak.add(mcData.blocksByName.jungle_leaves.id)
  blocksCanBreak.add(mcData.blocksByName.acacia_leaves.id)
  blocksCanBreak.add(mcData.blocksByName.dark_oak_leaves.id)

  const blocksToAvoid = new Set()
  blocksToAvoid.add(mcData.blocksByName.fire.id)
  blocksToAvoid.add(mcData.blocksByName.wheat.id)
  blocksToAvoid.add(mcData.blocksByName.water.id)
  blocksToAvoid.add(mcData.blocksByName.lava.id)

  const cardinalDirections = [
    { x: -1, z: 0 }, // north
    { x: 1, z: 0 }, // south
    { x: 0, z: -1 }, // east
    { x: 0, z: 1 } // west
  ]
  const diagonalDirections = [
    { x: -1, z: -1 },
    { x: -1, z: 1 },
    { x: 1, z: -1 },
    { x: 1, z: 1 }
  ]

  // for each cardinal direction:
  // "." is head. "+" is feet and current location.
  // "#" is initial floor which is always solid. "a"-"u" are blocks to check
  //
  //   --0123-- horizontalOffset
  //  |
  // +2  aho
  // +1  .bip
  //  0  +cjq
  // -1  #dkr
  // -2   els
  // -3   fmt
  // -4   gn
  //  |
  //  dy

  function getBlock (pos) {
    const b = bot.blockAt(new Vec3(pos.x, pos.y, pos.z))
    if (!b) {
      return {
        safe: false,
        physical: false
      }
    }
    b.safe = b.boundingBox === 'empty' && !blocksToAvoid.has(b.type)
    b.physical = b.boundingBox === 'block'
    return b
  }

  function safeToBreak (block) {
    return block.type && blocksCanBreak.has(block.type)
    // TODO: return false if next to liquid
  }

  function safeOrBreak (block, toBreak) {
    if (block.safe) return 0
    if (!safeToBreak(block)) return 100 // Can't break, so can't move
    toBreak.push(block.position)

    const digTime = block.digTime(bot.heldItem ? bot.heldItem.type : null, false, false, false)
    return 3 * digTime / 1000
  }

  function getMoveJumpUp (node, dir, neighbors) {
    const blockA = getBlock({ x: node.x, y: node.y + 2, z: node.z })
    const blockH = getBlock({ x: node.x + dir.x, y: node.y + 2, z: node.z + dir.z })
    const blockB = getBlock({ x: node.x + dir.x, y: node.y + 1, z: node.z + dir.z })
    const blockC = getBlock({ x: node.x + dir.x, y: node.y, z: node.z + dir.z })

    let cost = 1 // move cost
    const toBreak = []
    const toPlace = []

    if (!blockC.physical) {
      // TODO: avoid entities as part of placing blocks
      /* let blockD = getBlock({x:node.x+dir.x, y:node.y-1,   z:node.z+dir.z})
      if (!blockD.physical) return null

      //TODO: check if we have scaffolding blocks to place (how many have we placed so far)
      toPlace.push({x:node.x+dir.x, y:node.y-1, z:node.z+dir.x, dx:0, dy:1, dz:0})
      cost += 1; // additional cost for placing a block */
      return
    }

    cost += safeOrBreak(blockA, toBreak)
    if (cost > 100) return
    cost += safeOrBreak(blockH, toBreak)
    if (cost > 100) return
    cost += safeOrBreak(blockB, toBreak)
    if (cost > 100) return

    neighbors.push({ x: blockB.position.x, y: blockB.position.y, z: blockB.position.z, cost: cost, toBreak: toBreak, toPlace: toPlace })
  }

  function getMoveForward (node, dir, neighbors) {
    const blockB = getBlock({ x: node.x + dir.x, y: node.y + 1, z: node.z + dir.z })
    const blockC = getBlock({ x: node.x + dir.x, y: node.y, z: node.z + dir.z })
    const blockD = getBlock({ x: node.x + dir.x, y: node.y - 1, z: node.z + dir.z })

    let cost = 1 // move cost
    const toBreak = []
    const toPlace = []

    if (!blockD.physical) {
      // TODO: avoid entities as part of placing blocks
      // TODO: check if we have scaffolding blocks to place (how many have we placed so far)
      toPlace.push({ x: node.x, y: node.y - 1, z: node.z, dx: dir.x, dy: 0, dz: dir.z })
      cost += 1 // additional cost for placing a block
    }

    cost += safeOrBreak(blockB, toBreak)
    if (cost > 100) return
    cost += safeOrBreak(blockC, toBreak)
    if (cost > 100) return

    neighbors.push({ x: blockC.position.x, y: blockC.position.y, z: blockC.position.z, cost: cost, toBreak: toBreak, toPlace: toPlace })
  }

  function getMoveDiagonal (node, dir, neighbors) {
    const blockB = getBlock({ x: node.x + dir.x, y: node.y + 1, z: node.z + dir.z })
    const blockB1 = getBlock({ x: node.x, y: node.y + 1, z: node.z + dir.z })
    const blockB2 = getBlock({ x: node.x + dir.x, y: node.y + 1, z: node.z })

    const blockC = getBlock({ x: node.x + dir.x, y: node.y, z: node.z + dir.z })
    const blockC1 = getBlock({ x: node.x, y: node.y, z: node.z + dir.z })
    const blockC2 = getBlock({ x: node.x + dir.x, y: node.y, z: node.z })

    const blockD = getBlock({ x: node.x + dir.x, y: node.y - 1, z: node.z + dir.z })

    let cost = Math.SQRT2 // move cost
    const toBreak = []
    const toPlace = []

    if (!blockD.physical) return // we don't place blocks in diagonal

    cost += safeOrBreak(blockB1, toBreak)
    if (cost > 100) return
    cost += safeOrBreak(blockB2, toBreak)
    if (cost > 100) return
    cost += safeOrBreak(blockC1, toBreak)
    if (cost > 100) return
    cost += safeOrBreak(blockC2, toBreak)
    if (cost > 100) return

    cost += safeOrBreak(blockC, toBreak)
    if (cost > 100) return
    cost += safeOrBreak(blockB, toBreak)
    if (cost > 100) return

    neighbors.push({ x: blockC.position.x, y: blockC.position.y, z: blockC.position.z, cost: cost, toBreak: toBreak, toPlace: toPlace })
  }

  function getMoveDropDown (node, dir, neighbors) {
    const blockB = getBlock({ x: node.x + dir.x, y: node.y + 1, z: node.z + dir.z })
    const blockC = getBlock({ x: node.x + dir.x, y: node.y, z: node.z + dir.z })
    const blockD = getBlock({ x: node.x + dir.x, y: node.y - 1, z: node.z + dir.z })
    const blockE = getBlock({ x: node.x + dir.x, y: node.y - 2, z: node.z + dir.z })

    let cost = 1 // move cost
    const toBreak = []
    const toPlace = []

    if (!blockE.physical) return // TODO: place? (bridging down)

    // TODO: 2,3 block drops

    cost += safeOrBreak(blockB, toBreak)
    if (cost > 100) return
    cost += safeOrBreak(blockC, toBreak)
    if (cost > 100) return
    cost += safeOrBreak(blockD, toBreak)
    if (cost > 100) return

    return neighbors.push({ x: blockD.position.x, y: blockD.position.y, z: blockD.position.z, cost: cost, toBreak: toBreak, toPlace: toPlace })
  }

  return function (node) {
    const neighbors = []

    // Simple moves in 4 cardinal points
    for (const i in cardinalDirections) {
      const dir = cardinalDirections[i]
      getMoveForward(node, dir, neighbors)
      getMoveJumpUp(node, dir, neighbors)
      getMoveDropDown(node, dir, neighbors)
    }

    // Diagonals
    for (const i in diagonalDirections) {
      const dir = diagonalDirections[i]
      getMoveDiagonal(node, dir, neighbors)
    }

    return neighbors
  }
}

module.exports = makeGetNeighbors
