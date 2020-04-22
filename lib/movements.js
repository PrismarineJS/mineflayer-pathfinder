
var Vec3 = require('vec3').Vec3

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

class Movements {
  constructor (bot, mcData) {
    this.bot = bot

    this.digCost = 1
    this.dontCreateFlow = true

    this.blocksCantBreak = new Set()
    this.blocksCantBreak.add(mcData.blocksByName.chest.id)

    this.blocksToAvoid = new Set()
    this.blocksToAvoid.add(mcData.blocksByName.fire.id)
    this.blocksToAvoid.add(mcData.blocksByName.wheat.id)
    this.blocksToAvoid.add(mcData.blocksByName.water.id)
    this.blocksToAvoid.add(mcData.blocksByName.lava.id)

    this.liquids = new Set()
    this.liquids.add(mcData.blocksByName.water.id)
    this.liquids.add(mcData.blocksByName.lava.id)
  }

  getBlock (pos, dx, dy, dz) {
    const b = this.bot.blockAt(new Vec3(pos.x + dx, pos.y + dy, pos.z + dz))
    if (!b) {
      return {
        safe: false,
        physical: false,
        liquid: false
      }
    }
    b.safe = b.boundingBox === 'empty' && !this.blocksToAvoid.has(b.type)
    b.physical = b.boundingBox === 'block'
    b.liquid = this.liquids.has(b.type)
    return b
  }

  safeToBreak (block) {
    if (this.dontCreateFlow) {
      // false if next to liquid
      if (this.getBlock(block.position, 0, -1, 0).liquid) return false
      if (this.getBlock(block.position, -1, 0, 0).liquid) return false
      if (this.getBlock(block.position, 1, 0, 0).liquid) return false
      if (this.getBlock(block.position, 0, 0, -1).liquid) return false
      if (this.getBlock(block.position, 0, 0, 1).liquid) return false
    }
    return block.type && !this.blocksCantBreak.has(block.type)
    // TODO: break exclusion areas
  }

  safeOrBreak (block, toBreak) {
    if (block.safe) return 0
    if (!this.safeToBreak(block)) return 100 // Can't break, so can't move
    toBreak.push(block.position)

    const digTime = block.digTime(this.bot.pathfinder.bestHarvestTool(block), false, false, false)
    return 3 * digTime / 1000 * this.digCost
  }

  getMoveJumpUp (node, dir, neighbors) {
    const blockA = this.getBlock(node, 0, 2, 0)
    const blockH = this.getBlock(node, dir.x, 2, dir.z)
    const blockB = this.getBlock(node, dir.x, 1, dir.z)
    const blockC = this.getBlock(node, dir.x, 0, dir.z)

    let cost = 2 // move cost (move+jump)
    const toBreak = []
    const toPlace = []

    if (!blockC.physical) {
      if (node.remainingBlocks === 0) return // not enough blocks to place

      // TODO: avoid entities as part of placing blocks
      const blockD = this.getBlock(node, dir.x, -1, dir.z)
      if (!blockD.physical) {
        if (node.remainingBlocks === 1) return // not enough blocks to place
        toPlace.push({ x: node.x, y: node.y - 1, z: node.z, dx: dir.x, dy: 0, dz: dir.z })
        cost += 1 // additional cost for placing a block
      }

      toPlace.push({ x: node.x + dir.x, y: node.y - 1, z: node.z + dir.z, dx: 0, dy: 1, dz: 0 })
      cost += 1 // additional cost for placing a block
    }

    cost += this.safeOrBreak(blockA, toBreak)
    if (cost > 100) return
    cost += this.safeOrBreak(blockH, toBreak)
    if (cost > 100) return
    cost += this.safeOrBreak(blockB, toBreak)
    if (cost > 100) return

    neighbors.push({
      x: blockB.position.x,
      y: blockB.position.y,
      z: blockB.position.z,
      remainingBlocks: node.remainingBlocks - toPlace.length,
      cost: cost,
      toBreak: toBreak,
      toPlace: toPlace
    })
  }

  getMoveForward (node, dir, neighbors) {
    const blockB = this.getBlock(node, dir.x, 1, dir.z)
    const blockC = this.getBlock(node, dir.x, 0, dir.z)
    const blockD = this.getBlock(node, dir.x, -1, dir.z)

    let cost = 1 // move cost
    const toBreak = []
    const toPlace = []

    if (!blockD.physical) {
      // TODO: avoid entities as part of placing blocks
      if (node.remainingBlocks === 0) return // not enough blocks to place
      toPlace.push({ x: node.x, y: node.y - 1, z: node.z, dx: dir.x, dy: 0, dz: dir.z })
      cost += 1 // additional cost for placing a block
    }

    cost += this.safeOrBreak(blockB, toBreak)
    if (cost > 100) return
    cost += this.safeOrBreak(blockC, toBreak)
    if (cost > 100) return

    neighbors.push({
      x: blockC.position.x,
      y: blockC.position.y,
      z: blockC.position.z,
      remainingBlocks: node.remainingBlocks - toPlace.length,
      cost: cost,
      toBreak: toBreak,
      toPlace: toPlace
    })
  }

  getMoveDiagonal (node, dir, neighbors) {
    const blockB = this.getBlock(node, dir.x, 1, dir.z)
    const blockB1 = this.getBlock(node, 0, 1, dir.z)
    const blockB2 = this.getBlock(node, dir.x, 1, 0)

    const blockC = this.getBlock(node, dir.x, 0, dir.z)
    const blockC1 = this.getBlock(node, 0, 0, dir.z)
    const blockC2 = this.getBlock(node, dir.x, 0, 0)

    const blockD = this.getBlock(node, dir.x, -1, dir.z)

    let cost = Math.SQRT2 // move cost
    const toBreak = []

    if (!blockD.physical) return // we don't place blocks in diagonal

    cost += this.safeOrBreak(blockB1, toBreak)
    if (cost > 100) return
    cost += this.safeOrBreak(blockB2, toBreak)
    if (cost > 100) return
    cost += this.safeOrBreak(blockC1, toBreak)
    if (cost > 100) return
    cost += this.safeOrBreak(blockC2, toBreak)
    if (cost > 100) return

    cost += this.safeOrBreak(blockC, toBreak)
    if (cost > 100) return
    cost += this.safeOrBreak(blockB, toBreak)
    if (cost > 100) return

    neighbors.push({
      x: blockC.position.x,
      y: blockC.position.y,
      z: blockC.position.z,
      remainingBlocks: node.remainingBlocks,
      cost: cost,
      toBreak: toBreak,
      toPlace: []
    })
  }

  getMoveDropDown (node, dir, neighbors) {
    const blockB = this.getBlock(node, dir.x, 1, dir.z)
    const blockC = this.getBlock(node, dir.x, 0, dir.z)
    const blockD = this.getBlock(node, dir.x, -1, dir.z)
    const blockE = this.getBlock(node, dir.x, -2, dir.z)

    let cost = 1 // move cost
    const toBreak = []
    const toPlace = []

    if (!blockE.physical) return // TODO: place? (bridging down)

    // TODO: 2,3 block drops

    cost += this.safeOrBreak(blockB, toBreak)
    if (cost > 100) return
    cost += this.safeOrBreak(blockC, toBreak)
    if (cost > 100) return
    cost += this.safeOrBreak(blockD, toBreak)
    if (cost > 100) return

    return neighbors.push({
      x: blockD.position.x,
      y: blockD.position.y,
      z: blockD.position.z,
      remainingBlocks: node.remainingBlocks - toPlace.length,
      cost: cost,
      toBreak: toBreak,
      toPlace: toPlace
    })
  }

  getMoveDown (node, neighbors) {
    const block0 = this.getBlock(node, 0, -1, 0)
    const block1 = this.getBlock(node, 0, -2, 0)

    let cost = 1 // move cost
    const toBreak = []
    const toPlace = []

    if (!block1.physical) return

    cost += this.safeOrBreak(block0, toBreak)
    if (cost > 100) return

    return neighbors.push({
      x: block0.position.x,
      y: block0.position.y,
      z: block0.position.z,
      remainingBlocks: node.remainingBlocks - toPlace.length,
      cost: cost,
      toBreak: toBreak,
      toPlace: toPlace
    })
  }

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

  getNeighbors (node) {
    const neighbors = []

    // Simple moves in 4 cardinal points
    for (const i in cardinalDirections) {
      const dir = cardinalDirections[i]
      this.getMoveForward(node, dir, neighbors)
      this.getMoveJumpUp(node, dir, neighbors)
      this.getMoveDropDown(node, dir, neighbors)
    }

    // Diagonals
    for (const i in diagonalDirections) {
      const dir = diagonalDirections[i]
      this.getMoveDiagonal(node, dir, neighbors)
    }

    // this.getMoveDown(node, neighbors)

    return neighbors
  }
}

module.exports = Movements
