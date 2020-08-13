const { Movement, Action } = require('./movement')
const Vec3 = require('vec3').Vec3

function deltaToVec (delta) {
  return new Vec3(delta[0], delta[1], delta[2])
}

function radialSymmetry (delta) {
  return [
    [delta[0], delta[1], delta[2]],
    [-delta[2], delta[1], delta[0]],
    [-delta[0], delta[1], -delta[2]],
    [delta[2], delta[1], -delta[0]]
  ]
}

/**
 * A parser for reading movement plugin files to generate available
 * movement lists while pathfinding.
 */
class ModularMovementsHandler {
  /**
   * Creates a new modular movement handler instance.
   *
   * @param {Bot} bot - The bot this handler is acting on.
   * @param {boolean} loadDefault - Whether or not to load the default
   * movement plugin.
   */
  constructor (bot, loadDefault = true) {
    this.bot = bot
    this.movementPlugins = []
    this.settings = require('../../movements/settings.json')

    if (loadDefault) {
      this.loadMovements(require('../../movements/defaultMovements.json'))
    }
  }

  /**
   * Loads a new movement plugin to this handler from a Json file.
   *
   * @param {*} movements - The movement Json file to load movement
   * data from.
   */
  loadMovements (movements) {
    this.movementPlugins.push(movements)
  }

  /**
   * Gets all available movements (or neighbor nodes) which can be preformed
   * from the given node.
   *
   * @param {*} node - The node to handle.
   */
  getNeighbors (node) {
    const neighbors = []
    for (const plugin of this.movementPlugins) {
      for (const movement of plugin.movements) {
        if (movement.symmetry === 'radial') {
          for (let i = 0; i < 4; i++) {
            const m = this._handleMovement(movement, i, node)
            if (m) neighbors.push(m)
          }
        } else {
          const m = this._handleMovement(movement, 0, node)
          if (m) neighbors.push(m)
        }
      }
    }

    return neighbors
  }

  /**
   * Returns a new movement node if this current movement is considered
   * valid.
   *
   * @param {*} movement - The raw movement to test for validity.
   * @param {*} direction - The direction index to use for this handler.
   * @param {*} node - The node currently being handled.
   */
  _handleMovement (movement, direction, node) {
    const hash = this._generateHash(node.position)
    const m = new Movement(node.position, hash)

    for (const action of movement.actions) {
      const type = action.type
      const delta = deltaToVec(radialSymmetry(action.delta)[direction])
      const requirements = action.requires || []

      if (!this._meetsRequirements(node, requirements)) continue

      const block = this.bot.blockAt(node, node.position + delta)
      const a = new Action(type, block.position)

      if (type === 'mine') {
        if (!this._canMine(block)) continue
      }

      if (type === 'build') {
        if (!this._canPlace(block)) continue
      }

      m.actions.push(a)

      if (a.effectsBotPosition()) m.position = action.position
    }

    m.hash = this._generateHash(m.position)
    m.cost = this._calculateCost(m)

    if (m.actions.length > 0) return m
    else return null
  }

  /**
   * Generates the hash string for a movement object.
   *
   * @param {*} position - The position of the movement.
   */
  _generateHash (position) {
    return `${position.x},${position.y},${position.z}`
  }

  /**
   * Checks through the list of requirements for an action to make sure all
   * requirements are met.
   *
   * @param {*} node - The node being handled.
   * @param {*} requirements - The list of requirements to check.
   */
  _meetsRequirements (node, requirements) {
    for (const req of requirements) {
      const block = this.bot.blockAt(deltaToVec(req.delta) + node.position)

      if (req.boundingBox && req.boundingBox !== block.boundingBox) return false
    }

    return true
  }

  _calculateCost(movement) {
    return 1
  }

  /**
   * Checks if the given virtual block can be mined or now.
   *
   * @param {*} block - The virtual block.
   */
  _canMine (block) {
    // TODO Check if block type is in "cantBreak" list

    return this.settings.canMine
  }

  /**
   * Checks if a scaffolding block can be placed at this location.
   */
  _canPlace (block) {
    // TODO Check if has blocks

    return this.settings.canPlace
  }
}

module.exports = { ModularMovementsHandler }
