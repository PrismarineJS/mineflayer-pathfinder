/**
 * A collection of actions to preform, representing a single movement
 * node within a path.
 */
class Movement {
  constructor(position, hash) {
    this.position = position;
    this.hash = hash;
    this.actions = [];
  }
}

/**
 * A single task to preform while moving along a path.
 */
class Action {
  constructor(type, position) {
    this.type = type;
    this.position = position;
  }
}

module.exports = { Movement, Action };
