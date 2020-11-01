const { Vec3 } = require('vec3');
const nbt = require('prismarine-nbt');
const _minecraftData = require('minecraft-data');
const { cardinalDirections, diagonalDirections } = require('./constants');

class Movements {
  constructor(bot, minecraftData = _minecraftData(bot.version)) {
    Object.defineProperty(this, 'bot', { value: bot });

    this.digCost = 1;
    this.maxDropDown = 4;

    this.dontCreateFlow = true;
    this.allow1by1towers = true;
    this.allowFreeMotion = false;
    this.allowParkour = true;

    const { blocksByName, itemsByName } = minecraftData;

    this.immuneBlocks = new Set([
      blocksByName.bedrock.id,
      blocksByName.chest.id
    ]);

    this.avoidBlocks = new Set([
      blocksByName.fire.id,
      blocksByName.wheat.id,
      blocksByName.lava.id
    ]);

    this.liquids = new Set([
      blocksByName.water.id,
      blocksByName.lava.id
    ]);

    this.scaffoldingBlocks = new Set([
      itemsByName.dirt.id,
      itemsByName.cobblestone.id
    ]);
  }

  countScaffoldingItems() {
    return this.bot.inventory.items().reduce((count, item) => {
      if (!this.scaffoldingBlocks.has(item.type)) return count;
      else return count + item.count;
    }, 0);
  }

  getScaffoldingItem() {
    return this.bot.inventory.items().find(
      item => this.scaffoldingBlocks.has(item.type)
    ) || null;
  }

  getBlock(position, dx, dy, dz) {
    const block = position
      ? this.bot.blockAt(new Vec3(
        position.x + dx,
        position.y + dy,
        position.z + dz
      )) : null;

    if (block === null) {
      return {
        safe: false,
        physical: false,
        liquid: false,
        height: position ? position.y + dy : dy,
        block
      }
    }
    const { liquids } = this;
    const originalHeight = position.y + dy;
    const safeBlock = {
      safe: block.boundingBox === 'empty' && !this.avoidBlocks.has(block.type),
      physical: block.boundingBox === 'block',
      liquid: liquids.has(block.type),
      height: originalHeight,
      block
    }

    if ('shapes' in block) {
      for (const shape of block.shapes) {
        safeBlock.height = Math.max(safeBlock.height, originalHeight + shape[4]);
      }
    }

    return safeBlock;
  }

  safeToBreak(block) {
    if (this.dontCreateFlow) {
      // false if next to liquid
      if (this.getBlock(block.position, 0, 1, 0).liquid) return false;
      if (this.getBlock(block.position, -1, 0, 0).liquid) return false;
      if (this.getBlock(block.position, 1, 0, 0).liquid) return false;
      if (this.getBlock(block.position, 0, 0, -1).liquid) return false;
      if (this.getBlock(block.position, 0, 0, 1).liquid) return false;
    }
    return typeof block.type === 'number' && !this.immuneBlocks.has(block.type);
  }

  safeOrBreak({ safe, block }, toBreak) {
    if (safe) return 0;
    if (!this.safeToBreak(block)) return 100; // Can't break, so can't move
    toBreak.push(block.position);

    const tool = this.bot.pathfinder.bestHarvestTool(block);
    const enchants = (tool && tool.nbt) ? nbt.simplify(tool.nbt).Enchantments : [];
    const effects = this.bot.entity.effects;
    const digTime = block.digTime(tool ? tool.type : null, false, false, false, enchants, effects);
    return (1 + 3 * digTime / 1000) * this.digCost;
  }

  getMoveJumpUp(node, dir, neighbors) {
    const safeBlockA = this.getBlock(node, 0, 2, 0);
    const safeBlockB = this.getBlock(node, dir.x, 1, dir.z);
    const safeBlockC = this.getBlock(node, dir.x, 0, dir.z);
    const safeBlockH = this.getBlock(node, dir.x, 2, dir.z);

    let cost = 2; // move cost (move+jump)
    const toBreak = [];
    const toPlace = [];

    if (!safeBlockC.physical) {
      if (node.remainingBlocks === 0) return; // not enough blocks to place

      // TODO: avoid entities as part of placing blocks
      const blockD = this.getBlock(node, dir.x, -1, dir.z);
      if (!blockD.physical) {
        if (node.remainingBlocks === 1) return; // not enough blocks to place
        toPlace.push({ x: node.x, y: node.y - 1, z: node.z, dx: dir.x, dy: 0, dz: dir.z });
        cost += 1; // additional cost for placing a block
      }

      toPlace.push({ x: node.x + dir.x, y: node.y - 1, z: node.z + dir.z, dx: 0, dy: 1, dz: 0 });
      cost += 1; // additional cost for placing a block

      safeBlockC.height += 1;
    }

    const block0 = this.getBlock(node, 0, -1, 0);
    if (safeBlockC.height - block0.height > 1) return; // Too high to jump

    cost += this.safeOrBreak(safeBlockA, toBreak);
    if (cost > 100) return;
    cost += this.safeOrBreak(safeBlockH, toBreak);
    if (cost > 100) return;
    cost += this.safeOrBreak(safeBlockB, toBreak);
    if (cost > 100) return;

    const blockB = safeBlockB.block;

    neighbors.push(new Move(
      blockB.position.x,
      blockB.position.y,
      blockB.position.z,
      node.remainingBlocks - toPlace.length,
      cost, toBreak, toPlace
    ))
  }

  getMoveForward(node, dir, neighbors) {
    const safeBlockB = this.getBlock(node, dir.x, 1, dir.z);
    const safeBlockC = this.getBlock(node, dir.x, 0, dir.z);
    const safeBlockD = this.getBlock(node, dir.x, -1, dir.z);

    let cost = 1; // move cost
    const toBreak = [];
    const toPlace = [];

    if (!safeBlockD.physical && !safeBlockC.liquid) {
      if (node.remainingBlocks === 0) return; // not enough blocks to place
      toPlace.push({ x: node.x, y: node.y - 1, z: node.z, dx: dir.x, dy: 0, dz: dir.z });
      cost += 1;// additional cost for placing a block
    }

    cost += this.safeOrBreak(safeBlockB, toBreak);
    if (cost > 100) return;
    cost += this.safeOrBreak(safeBlockC, toBreak);
    if (cost > 100) return;

    const blockC = safeBlockC.block;

    neighbors.push(new Move(
      blockC.position.x,
      blockC.position.y,
      blockC.position.z,
      node.remainingBlocks - toPlace.length,
      cost, toBreak, toPlace
    ))
  }

  getMoveDiagonal(node, dir, neighbors) {
    const safeblockB = this.getBlock(node, dir.x, 1, dir.z);
    const safeBlockB1 = this.getBlock(node, 0, 1, dir.z);
    const safeBlockB2 = this.getBlock(node, dir.x, 1, 0);

    const safeBlockC = this.getBlock(node, dir.x, 0, dir.z);
    const safeBlockC1 = this.getBlock(node, 0, 0, dir.z);
    const safeBlockC2 = this.getBlock(node, dir.x, 0, 0);

    const safeBlockD = this.getBlock(node, dir.x, -1, dir.z);

    let cost = Math.SQRT2; // move cost
    const toBreak = [];

    if (!safeBlockD.physical) return; // we don't place blocks in diagonal

    cost += this.safeOrBreak(safeBlockB1, toBreak);
    if (cost > 100) return;
    cost += this.safeOrBreak(safeBlockB2, toBreak);
    if (cost > 100) return;
    cost += this.safeOrBreak(safeBlockC1, toBreak);
    if (cost > 100) return;
    cost += this.safeOrBreak(safeBlockC2, toBreak);
    if (cost > 100) return;

    cost += this.safeOrBreak(safeBlockC, toBreak);
    if (cost > 100) return;
    cost += this.safeOrBreak(safeblockB, toBreak);
    if (cost > 100) return;

    const blockC = safeBlockC.block;

    neighbors.push(new Move(
      blockC.position.x,
      blockC.position.y,
      blockC.position.z,
      node.remainingBlocks,
      cost, toBreak
    ))
  }

  getLandingBlock(node, dir) {
    let landingBlock = this.getBlock(node, dir.x, -2, dir.z);
    for (let i = 0; i < this.maxDropDown - 1; i++) {
      if (landingBlock.physical || !landingBlock.safe) break;
      landingBlock = this.getBlock(node, dir.x, -2 - i, dir.z);
    }
    return landingBlock;
  }

  getMoveDropDown(node, dir, neighbors) {
    const safeBlockB = this.getBlock(node, dir.x, 1, dir.z);
    const safeBlockC = this.getBlock(node, dir.x, 0, dir.z);
    const safeBlockD = this.getBlock(node, dir.x, -1, dir.z);

    let cost = 1; // move cost
    const toBreak = [];
    const toPlace = [];

    const safeLandingBlock = this.getLandingBlock(node, dir);

    if (!safeLandingBlock.physical) return;

    cost += this.safeOrBreak(safeBlockB, toBreak);
    if (cost > 100) return;
    cost += this.safeOrBreak(safeBlockC, toBreak);
    if (cost > 100) return;
    cost += this.safeOrBreak(safeBlockD, toBreak);
    if (cost > 100) return;

    const landingBlock = safeLandingBlock.block;

    neighbors.push(new Move(
      landingBlock.position.x,
      landingBlock.position.y + 1,
      landingBlock.position.z,
      node.remainingBlocks - toPlace.length,
      cost, toBreak, toPlace
    ))
  }

  getMoveDown(node, neighbors) {
    const safeBlock = this.getBlock(node, 0, -1, 0);

    let cost = 1; // move cost
    const toBreak = [];
    const toPlace = [];

    const safeLandingBlock = this.getLandingBlock(node, { x: 0, z: 0 });
    if (!safeLandingBlock.physical) return;

    cost += this.safeOrBreak(safeBlock, toBreak);
    if (cost > 100) return;

    const landingBlock = safeLandingBlock.block;

    neighbors.push(new Move(
      landingBlock.position.x,
      landingBlock.position.y + 1,
      landingBlock.position.z,
      node.remainingBlocks - toPlace.length,
      cost, toBreak, toPlace
    ))
  }

  getMoveUp(node, neighbors) {
    const safeBlock = this.getBlock(node, 0, 2, 0);
    let cost = 1; // move cost
    const toBreak = [];
    const toPlace = [];
    cost += this.safeOrBreak(safeBlock, toBreak);
    if (cost > 100) return;

    if (node.remainingBlocks === 0) return; // not enough blocks to place

    const block0 = this.getBlock(node, 0, -1, 0);
    if (block0.height < node.y) return; // cannot jump-place from a half block

    toPlace.push({ x: node.x, y: node.y - 1, z: node.z, dx: 0, dy: 1, dz: 0, jump: true });
    cost += 1 // additional cost for placing a block

    neighbors.push(new Move(
      node.x,
      node.y + 1,
      node.z,
      node.remainingBlocks - toPlace.length,
      cost, toBreak, toPlace
    ))
  }

  // Jump up, down or forward over a 1 block gap
  getMoveParkourForward(node, dir, neighbors) {
    if (
      this.getBlock(node, dir.x, -1, dir.z).physical ||
      !this.getBlock(node, dir.x, 0, dir.z).safe ||
      !this.getBlock(node, dir.x, 1, dir.z).safe
    ) return;

    const dx = dir.x * 2;
    const dz = dir.z * 2;
    const safeBlockB = this.getBlock(node, dx, 1, dz);
    const safeBlockC = this.getBlock(node, dx, 0, dz);
    const safeBlockD = this.getBlock(node, dx, -1, dz);

    if (safeBlockB.safe && safeBlockC.safe && safeBlockD.physical) {
      // Forward
      if (!this.getBlock(node, 0, 2, 0).safe || !this.getBlock(node, dir.x, 2, dir.z).safe) return;
      const blockC = safeBlockC.block;
      neighbors.push(new Move(
        blockC.position.x,
        blockC.position.y,
        blockC.position.z,
        node.remainingBlocks,
        1, [], [], true
      ));
    } else if (safeBlockB.safe && safeBlockC.physical) {
      // Up
      if (
        !this.getBlock(node, 0, 2, 0).safe ||
        !this.getBlock(node, dir.x, 2, dir.z).safe ||
        !this.getBlock(node, dx, 2, dz).safe
      ) return;
      const blockB = safeBlockB.block;
      neighbors.push(new Move(
        blockB.position.x,
        blockB.position.y,
        blockB.position.z,
        node.remainingBlocks,
        1, [], [], true
      ))
    } else if (safeBlockC.safe && safeBlockD.safe) {
      // Down
      const safeBlockE = this.getBlock(node, dx, -2, dz);
      if (!safeBlockE.physical) return;
      const blockE = safeBlockE.block;
      neighbors.push(new Move(
        blockE.position.x,
        blockE.position.y,
        blockE.position.z,
        node.remainingBlocks,
        1, [], [], true
      ))
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

  getNeighbors(node) {
    const neighbors = [];

    // Simple moves in 4 cardinal points
    for (const i in cardinalDirections) {
      const dir = cardinalDirections[i];
      this.getMoveForward(node, dir, neighbors);
      this.getMoveJumpUp(node, dir, neighbors);
      this.getMoveDropDown(node, dir, neighbors);
      if (this.allowParkour) {
        this.getMoveParkourForward(node, dir, neighbors);
      }
    }

    // Diagonals
    for (const i in diagonalDirections) {
      const dir = diagonalDirections[i];
      this.getMoveDiagonal(node, dir, neighbors);
    }

    this.getMoveDown(node, neighbors);

    if (this.allow1by1towers) {
      this.getMoveUp(node, neighbors);
    }

    return neighbors;
  }
}

module.exports = Movements;