const ModularMovementsHandler = require('./handler').ModularMovementsHandler
const VirtualWorld = require('./virtualWorld').VirtualWorld
const { Movement, Action } = require('./movement')
const { Vec3 } = require('vec3')

function originalNodeToNew (node) {
  const position = new Vec3(node.x, node.y, node.z)
  const movement = new Movement(position)

  movement.cost = node.cost
  movement.hash = node.hash

  for (const toBreak of node.toBreak) {
    movement.actions.push(new Action('mine', toBreak, movement))
  }

  for (const toPlace of node.toPlace) {
    const blockPos = new Vec3(toPlace.x, toPlace.y, toPlace.z)
    const action = new Action('build', blockPos, movement)
    action.against = new Vec3(toPlace.dx, toPlace.dy, toPlace.dz)
    movement.actions.push(action)
  }

  return movement
}

function newNodeToOriginal (movement) {
  const toBreak = []
  for (const action of movement.actions) {
    if (action.type === 'mine') toBreak.push(action.position)
  }

  const toPlace = []
  for (const action of movement.actions) {
    if (action.type === 'build') {
      toPlace.push({
        x: action.position.x,
        y: action.position.y,
        z: action.position.z,
        dx: action.against.x,
        dy: action.against.y,
        dz: action.against.z
      })
    }
  }

  const node = {}
  node.x = movement.position.x
  node.y = movement.position.y
  node.z = movement.position.z
  node.remainingBlocks = 0
  node.cost = movement.cost
  node.toBreak = toBreak
  node.toPlace = toPlace
  node.parkour = false
  node.hash = movement.hash

  return node
}

class MovementsBridge {
  constructor () {
    this.movements = new ModularMovementsHandler()
    this.world = new VirtualWorld()
  }

  getNeighbors (node) {
    node = originalNodeToNew(node)
    const neighbors = this.movements.getNeighbors(node, this.world)

    for (let i = 0; i < neighbors.length; i++) {
      neighbors[i] = newNodeToOriginal(neighbors[i])
    }

    return neighbors
  }

  countScaffoldingItems () {
    return 0
  }
}

module.exports = MovementsBridge
