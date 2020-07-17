const { Movement } = require("./movement");
const Vec3 = require("vec3").Vec3;

function deltaToVec(delta) {
  return new Vec3(delta[0], delta[1], delta[2]);
}

/**
 * A parser for reading movement plugin files to generate available
 * movement lists while pathfinding.
 */
class ModularMovementsHandler {
  /**
   * Creates a new modular movement handler instance.
   *
   * @param {boolean} loadDefault - Whether or not to load the default
   * movement plugin.
   */
  constructor(loadDefault = true) {
    this.movementPlugins = [];
    this.settings = require("../../movements/settings.json");

    if (loadDefault) {
      this.loadMovements(require("../../movements/defaultMovements.json"));
    }
  }

  /**
   * Loads a new movement plugin to this handler from a Json file.
   *
   * @param {*} movements - The movement Json file to load movement
   * data from.
   */
  loadMovements(movements) {
    this.movementPlugins.push(movements);
  }

  /**
   * Gets all available movements (or neighbor nodes) which can be preformed
   * from the given node.
   *
   * @param {*} node - The node to handle.
   * @param {*} world - The virtual world state.
   */
  getNeighbors(node, world) {
    const neighbors = [];
    for (const plugin of this.movementPlugins) {
      for (const movement of plugin.movements) {
        const m = this._handleMovement(movement, node, world);
        if (m) neighbors.push(m);
      }
    }

    return neighbors;
  }

  /**
   * Returns a new movement node if this current movement is considered
   * valid.
   *
   * @param {*} movement - The raw movement to test for validity.
   * @param {*} node - The node currently being handled.
   * @param {*} world - The virtual world state.
   */
  _handleMovement(movement, node, world) {
    const position = deltaToVec(movement.delta) + node.position;
    const hash = this._generateHash(movement.hash, position);

    const m = new Movement(position, hash);

    for (const action of movement.actions) {
      const type = action.type;
      const delta = deltaToVec(action.delta);
      const requirements = action.requires || [];

      if (!this._meetsRequirements(node, world, requirements)) continue;

      const block = world.virtualBlockAt(node, node.position + delta);
      if (type === "mine" && !this._canMine(block)) continue;
      if (type === "build" && !this._canPlace(block)) continue;

      const action = new Action(type, delta);
      m.actions.push(action);
    }

    if (m.actions.length > 0) return m;
    else return null;
  }

  /**
   * Generates the hash string for a movement object.
   *
   * @param {*} hash - The hash string.
   * @param {*} position - The position of the movement.
   */
  _generateHash(hash, position) {
    hash = hash.replace("%X", position.x);
    hash = hash.replace("%Y", position.y);
    hash = hash.replace("%Z", position.z);
    return hash;
  }

  /**
   * Checks through the list of requirements for an action to make sure all
   * requirements are met.
   *
   * @param {*} node - The node being handled.
   * @param {*} world - The virtual world state.
   * @param {*} requirements - The list of requirements to check.
   */
  _meetsRequirements(node, world, requirements) {
    for (const req of requirements) {
      const block = world.virtualBlockAt(deltaToVec(req.delta) + node.position);

      if (req.boundingBox && req.boundingBox !== block.boundingBox)
        return false;
    }

    return true;
  }

  /**
   * Checks if the given virtual block can be mined or now.
   *
   * @param {*} block - The virtual block.
   */
  _canMine(block) {
    // TODO Check if block type is in "cantBreak" list

    return this.settings.canMine;
  }

  /**
   * Checks if a scaffolding block can be placed at this location.
   */
  _canPlace(block) {
    // TODO Check if has blocks

    return this.settings.canPlace;
  }
}

module.exports = { ModularMovementsHandler };
