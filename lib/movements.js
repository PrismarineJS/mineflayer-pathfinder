
const Vec3 = require('vec3').Vec3
const nbt = require('prismarine-nbt')
const Move = require('./move')

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
    this.allow1by1towers = true
    this.allowFreeMotion = false
    this.allowParkour = true

    this.blocksCantBreak = new Set()
    this.blocksCantBreak.add(mcData.blocksByName.bedrock.id)
    this.blocksCantBreak.add(mcData.blocksByName.chest.id)

    this.blocksToAvoid = new Set()
    this.blocksToAvoid.add(mcData.blocksByName.fire.id)
    this.blocksToAvoid.add(mcData.blocksByName.wheat.id)
    this.blocksToAvoid.add(mcData.blocksByName.lava.id)

    this.liquids = new Set()
    this.liquids.add(mcData.blocksByName.water.id)
    this.liquids.add(mcData.blocksByName.lava.id)

    this.scafoldingBlocks = []
    this.scafoldingBlocks.push(mcData.blocksByName.dirt.id)
    this.scafoldingBlocks.push(mcData.blocksByName.cobblestone.id)

    this.maxDropDown = 4
  }

  countScaffoldingItems () {
    let count = 0
    const items = this.bot.inventory.items()
    for (const id of this.scafoldingBlocks) {
      for (const j in items) {
        const item = items[j]
        if (item.type === id) count += item.count
      }
    }
    return count
  }

  getScaffoldingItem () {
    const items = this.bot.inventory.items()
    for (const id of this.scafoldingBlocks) {
      for (const j in items) {
        const item = items[j]
        if (item.type === id) return item
      }
    }
    return null
  }

  getBlock (pos, dx, dy, dz) {
    const b = pos ? this.bot.blockAt(new Vec3(pos.x + dx, pos.y + dy, pos.z + dz), false) : null
    if (!b) {
      return {
        safe: false,
        physical: false,
        liquid: false,
        height: pos.y + dy
      }
    }
    b.safe = b.boundingBox === 'empty' && !this.blocksToAvoid.has(b.type)
    b.physical = b.boundingBox === 'block'
    b.liquid = this.liquids.has(b.type)
    b.height = pos.y + dy
    for (const shape of b.shapes) {
      b.height = Math.max(b.height, pos.y + dy + shape[4])
    }
    return b
  }

  safeToBreak (block) {
    if (this.dontCreateFlow) {
      // false if next to liquid
      if (this.getBlock(block.position, 0, 1, 0).liquid) return false
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

    const tool = this.bot.pathfinder.bestHarvestTool(block)
    const enchants = (tool && tool.nbt) ? nbt.simplify(tool.nbt).Enchantments : []
    const effects = this.bot.entity.effects
    const digTime = block.digTime(tool ? tool.type : null, false, false, false, enchants, effects)
    return (1 + 3 * digTime / 1000) * this.digCost
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

      blockC.height += 1
    }

    const block0 = this.getBlock(node, 0, -1, 0)
    if (blockC.height - block0.height > 1) return // Too high to jump

    cost += this.safeOrBreak(blockA, toBreak)
    if (cost > 100) return
    cost += this.safeOrBreak(blockH, toBreak)
    if (cost > 100) return
    cost += this.safeOrBreak(blockB, toBreak)
    if (cost > 100) return

    neighbors.push(new Move(blockB.position.x, blockB.position.y, blockB.position.z, node.remainingBlocks - toPlace.length, cost, toBreak, toPlace))
  }

  getMoveForward (node, dir, neighbors) {
    const blockB = this.getBlock(node, dir.x, 1, dir.z)
    const blockC = this.getBlock(node, dir.x, 0, dir.z)
    const blockD = this.getBlock(node, dir.x, -1, dir.z)

    let cost = 1 // move cost
    const toBreak = []
    const toPlace = []

    if (!blockD.physical && !blockC.liquid) {
      if (node.remainingBlocks === 0) return // not enough blocks to place
      toPlace.push({ x: node.x, y: node.y - 1, z: node.z, dx: dir.x, dy: 0, dz: dir.z })
      cost += 1 // additional cost for placing a block
    }

    cost += this.safeOrBreak(blockB, toBreak)
    if (cost > 100) return
    cost += this.safeOrBreak(blockC, toBreak)
    if (cost > 100) return

    neighbors.push(new Move(blockC.position.x, blockC.position.y, blockC.position.z, node.remainingBlocks - toPlace.length, cost, toBreak, toPlace))
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

    neighbors.push(new Move(blockC.position.x, blockC.position.y, blockC.position.z, node.remainingBlocks, cost, toBreak))
  }

  getLandingBlock (node, dir) {
    let blockLand = this.getBlock(node, dir.x, -2, dir.z)
    for (let i = 0; i < this.maxDropDown - 1; i++) {
      if (blockLand.physical || !blockLand.safe) break
      blockLand = this.getBlock(node, dir.x, -2 - i, dir.z)
    }
    return blockLand
  }

  getMoveDropDown (node, dir, neighbors) {
    const blockB = this.getBlock(node, dir.x, 1, dir.z)
    const blockC = this.getBlock(node, dir.x, 0, dir.z)
    const blockD = this.getBlock(node, dir.x, -1, dir.z)

    let cost = 1 // move cost
    const toBreak = []
    const toPlace = []

    const blockLand = this.getLandingBlock(node, dir)

    if (!blockLand.physical) return // TODO: place? (bridging down)

    cost += this.safeOrBreak(blockB, toBreak)
    if (cost > 100) return
    cost += this.safeOrBreak(blockC, toBreak)
    if (cost > 100) return
    cost += this.safeOrBreak(blockD, toBreak)
    if (cost > 100) return

    neighbors.push(new Move(blockLand.position.x, blockLand.position.y + 1, blockLand.position.z, node.remainingBlocks - toPlace.length, cost, toBreak, toPlace))
  }

  getMoveDown (node, neighbors) {
    const block0 = this.getBlock(node, 0, -1, 0)

    let cost = 1 // move cost
    const toBreak = []
    const toPlace = []

    const blockLand = this.getLandingBlock(node, { x: 0, z: 0 })
    if (!blockLand.physical) return

    cost += this.safeOrBreak(block0, toBreak)
    if (cost > 100) return

    neighbors.push(new Move(blockLand.position.x, blockLand.position.y + 1, blockLand.position.z, node.remainingBlocks - toPlace.length, cost, toBreak, toPlace))
  }

  getMoveUp (node, neighbors) {
    const block2 = this.getBlock(node, 0, 2, 0)
    let cost = 1 // move cost
    const toBreak = []
    const toPlace = []
    cost += this.safeOrBreak(block2, toBreak)
    if (cost > 100) return

    if (node.remainingBlocks === 0) return // not enough blocks to place

    const block0 = this.getBlock(node, 0, -1, 0)
    if (block0.height < node.y) return // cannot jump-place from a half block

    toPlace.push({ x: node.x, y: node.y - 1, z: node.z, dx: 0, dy: 1, dz: 0, jump: true })
    cost += 1 // additional cost for placing a block

    neighbors.push(new Move(node.x, node.y + 1, node.z, node.remainingBlocks - toPlace.length, cost, toBreak, toPlace))
  }

  // Jump up, down or forward over a 1 block gap
  getMoveParkourForward (node, dir, neighbors) {
    if (this.getBlock(node, dir.x, -1, dir.z).physical ||
      !this.getBlock(node, dir.x, 0, dir.z).safe ||
      !this.getBlock(node, dir.x, 1, dir.z).safe) return

    const dx = dir.x * 2
    const dz = dir.z * 2
    const blockB = this.getBlock(node, dx, 1, dz)
    const blockC = this.getBlock(node, dx, 0, dz)
    const blockD = this.getBlock(node, dx, -1, dz)

    if (blockB.safe && blockC.safe && blockD.physical) {
      // Forward
      if (!this.getBlock(node, 0, 2, 0).safe ||
        !this.getBlock(node, dir.x, 2, dir.z).safe) return
      neighbors.push(new Move(blockC.position.x, blockC.position.y, blockC.position.z, node.remainingBlocks, 1, [], [], true))
    } else if (blockB.safe && blockC.physical) {
      // Up
      if (!this.getBlock(node, 0, 2, 0).safe ||
        !this.getBlock(node, dir.x, 2, dir.z).safe ||
        !this.getBlock(node, dx, 2, dz).safe) return
      neighbors.push(new Move(blockB.position.x, blockB.position.y, blockB.position.z, node.remainingBlocks, 1, [], [], true))
    } else if (blockC.safe && blockD.safe) {
      // Down
      const blockE = this.getBlock(node, dx, -2, dz)
      if (!blockE.physical) return
      neighbors.push(new Move(blockE.position.x, blockE.position.y, blockE.position.z, node.remainingBlocks, 1, [], [], true))
    }
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
      if (this.allowParkour) {
        this.getMoveParkourForward(node, dir, neighbors)
      }
    }

    // Diagonals
    for (const i in diagonalDirections) {
      const dir = diagonalDirections[i]
      this.getMoveDiagonal(node, dir, neighbors)
    }

    this.getMoveDown(node, neighbors)

    if (this.allow1by1towers) {
      this.getMoveUp(node, neighbors)
    }

    return neighbors
  }
}

module.exports = Movements
