/**
 * Checks to make sure two positions are equal.
 *
 * @param {Vec3} a - The first position
 * @param {Vec3} b - The second position
 */
function samePos(a, b) {
  return a.x === b.x && a.y === b.y && a.z === z;
}

/**
 * A wrapper for the block world which allows for checking what the world state would
 * be along a theoretical path.
 */
class VirtualWorld {
  constructor(bot, world) {
    this.bot = bot;
    this.world = world;
  }

  /**
   * Gets what block would be at this location at this node along the path.
   *
   * @param {Movement} node - The current movement node to check.
   * @param {*} position - The position within the world.
   */
  virtualBlockAt(node, position) {
    while (node) {
      for (let i = node.actions.length - 1; i >= 0; i--) {
        const action = node.actions[i];
        if (samePos(action.position, position)) {
          if (action.type === "mine")
            return {
              type: "air",
              position: position,
              boundingBox: "empty",
            };

          if (action.type === "build") {
            return {
              type: action.scaffolding,
              position: position,
              boundingBox: "block",
            };
          }
        }
      }

      node = node.parent;
    }

    return this.world.blockAt(position);
  }

  /**
   * Gets what the bots inventory would look like at this node
   * along the path.
   *
   * @param {Movement} node - The current movement node to check.
   */
  getInventoryAt(node) {
    // TODO Handle removing blocks as they are placed
    // TODO Handle removing tools as they are broken

    // TODO [Maybe] Handling adding blocks as they are mined and collected
    // This one might be difficult as the bot might not always collect dropped blocks.
    // However, if the bot does have a "collect" action, then the bot could theoretically
    // try to collect materials to make a bridge if it doesn't have enough. Needs discussion.

    return this.bot.inventory;
  }
}
