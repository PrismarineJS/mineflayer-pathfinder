/**
 * A collection of actions to preform, representing a single movement
 * node within a path.
 */
class Movement {
  /**
   * Creates a new movement object to store within a path node.
   *
   * @param {*} position - The end position of this movement in the world.
   * @param {*} hash - The hash of this movement.
   */
  constructor(position, hash) {
    this.position = position;
    this.hash = hash;
    this.actions = [];

    // TODO Assign "pathNode" to Movement data within AStar to correctly access hierarchy data.
    this.pathNode = undefined;
  }
}

/**
 * A single task to preform while moving along a path.
 */
class Action {
  /**
   * Creates a new action object.
   *
   * @param {string} type - The action type.
   * @param {*} position - The position within the world this action is targeting.
   * @param {*} movement - The movement object this action is in.
   */
  constructor(type, position, movement) {
    this.type = type;
    this.position = position;
    this.movement = movement;
  }

  effectsBotPosition() {
    return type === "walk" || type === "fall" || type === "jump";
  }
}

module.exports = { Movement, Action };
