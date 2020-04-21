// One specific block that the player should stand inside at foot level
class GoalBlock {
  constructor (x, y, z) {
    this.x = Math.floor(x)
    this.y = Math.floor(y)
    this.z = Math.floor(z)
  }

  heuristic (node) {
    const dx = this.x - node.x
    const dy = this.y - node.y
    const dz = this.z - node.z
    return distanceXZ(dx, dz) + Math.abs(dy)
  }

  isEnd (node) {
    return node.x === this.x && node.y === this.y && node.z === this.z
  }
}

// A block position that the player should get within a certain radius of, used for following entities
class GoalNear {
  constructor (x, y, z, range) {
    this.x = Math.floor(x)
    this.y = Math.floor(y)
    this.z = Math.floor(z)
    this.rangeSq = range * range
  }

  heuristic (node) {
    const dx = this.x - node.x
    const dy = this.y - node.y
    const dz = this.z - node.z
    return distanceXZ(dx, dz) + Math.abs(dy)
  }

  isEnd (node) {
    const dx = this.x - node.x
    const dy = this.y - node.y
    const dz = this.z - node.z
    return (dx * dx + dy * dy + dz * dz) <= this.rangeSq
  }
}

// Useful for long-range goals that don't have a specific Y level
class GoalXZ {
  constructor (x, z) {
    this.x = Math.floor(x)
    this.z = Math.floor(z)
  }

  heuristic (node) {
    const dx = this.x - node.x
    const dz = this.z - node.z
    return distanceXZ(dx, dz)
  }

  isEnd (node) {
    return node.x === this.x && node.z === this.z
  }
}

// Goal is a Y coordinate
class GoalY {
  constructor (y) {
    this.y = Math.floor(y)
  }

  heuristic (node) {
    const dy = this.y - node.y
    return Math.abs(dy)
  }

  isEnd (node) {
    return node.y === this.y
  }
}

// Don't get into the block, but get directly adjacent to it. Useful for chests.
class GoalGetToBlock {
  constructor (x, y, z) {
    this.x = Math.floor(x)
    this.y = Math.floor(y)
    this.z = Math.floor(z)
  }

  heuristic (node) {
    const dx = node.x - this.x
    const dy = node.y - this.y
    const dz = node.z - this.z
    return distanceXZ(dx, dz) + Math.abs(dy < 0 ? dy + 1 : dy)
  }

  isEnd (node) {
    const dx = node.x - this.x
    const dy = node.y - this.y
    const dz = node.z - this.z
    return Math.abs(dx) + Math.abs(dy < 0 ? dy + 1 : dy) + Math.abs(dz) <= 1
  }
}

// A composite of many goals, any one of which satisfies the composite.
// For example, a GoalComposite of block goals for every oak log in loaded chunks
// would result in it pathing to the easiest oak log to get to
class GoalComposite {
  constructor () {
    this.goals = []
  }

  push (goal) {
    this.goals.push(goal)
  }

  heuristic (node) {
    let min = Number.MAX_VALUE
    for (const i in this.goals) {
      min = Math.min(min, this.goals[i].heuristic(node))
    }
    return min
  }

  isEnd (node) {
    for (const i in this.goals) {
      if (this.goals[i].isEnd(node)) return true
    }
    return false
  }
}

function distanceXZ (dx, dz) {
  dx = Math.abs(dx)
  dz = Math.abs(dz)
  return Math.abs(dx - dz) + Math.min(dx, dz) * Math.SQRT2
}

module.exports = {
  GoalBlock,
  GoalNear,
  GoalXZ,
  GoalY,
  GoalGetToBlock,
  GoalComposite
}
