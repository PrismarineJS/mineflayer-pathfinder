// Goal base class
class Goal {
  // Return the distance between node and the goal
  heuristic (node) {
    return 0
  }

  // Return true if the node has reach the goal
  isEnd (node) {
    return true
  }

  // Return true if the goal has changed and the current path
  // should be invalidated and computed again
  hasChanged () {
    return false
  }
}

// One specific block that the player should stand inside at foot level
class GoalBlock extends Goal {
  constructor (x, y, z) {
    super()
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
class GoalNear extends Goal {
  constructor (x, y, z, range) {
    super()
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
class GoalXZ extends Goal {
  constructor (x, z) {
    super()
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
class GoalY extends Goal {
  constructor (y) {
    super()
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
class GoalGetToBlock extends Goal {
  constructor (x, y, z) {
    super()
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
// For example, a GoalCompositeAny of block goals for every oak log in loaded
// chunks would result in it pathing to the easiest oak log to get to
class GoalCompositeAny extends Goal {
  constructor () {
    super()
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

  hasChanged () {
    for (const i in this.goals) {
      if (this.goals[i].hasChanged()) return true
    }
    return false
  }
}

// A composite of many goals, all of them needs to be satisfied.
class GoalCompositeAll extends Goal {
  constructor () {
    super()
    this.goals = []
  }

  push (goal) {
    this.goals.push(goal)
  }

  heuristic (node) {
    let max = Number.MIN_VALUE
    for (const i in this.goals) {
      max = Math.max(max, this.goals[i].heuristic(node))
    }
    return max
  }

  isEnd (node) {
    for (const i in this.goals) {
      if (!this.goals[i].isEnd(node)) return false
    }
    return true
  }

  hasChanged () {
    for (const i in this.goals) {
      if (this.goals[i].hasChanged()) return true
    }
    return false
  }
}

class GoalInvert extends Goal {
  constructor (goal) {
    super()
    this.goal = goal
  }

  heuristic (node) {
    return -this.goal.heuristic(node)
  }

  isEnd (node) {
    return !this.goal.isEnd(node)
  }

  hasChanged () {
    return this.goal.hasChanged()
  }
}

class GoalFollow extends Goal {
  constructor (entity, range) {
    super()
    this.entity = entity
    this.x = Math.floor(entity.position.x)
    this.y = Math.floor(entity.position.y)
    this.z = Math.floor(entity.position.z)
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

  hasChanged () {
    const p = this.entity.position.floored()
    const dx = this.x - p.x
    const dy = this.y - p.y
    const dz = this.z - p.z
    if ((dx * dx + dy * dy + dz * dz) > this.rangeSq) {
      this.x = p.x
      this.y = p.y
      this.z = p.z
      return true
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
  Goal,
  GoalBlock,
  GoalNear,
  GoalXZ,
  GoalY,
  GoalGetToBlock,
  GoalCompositeAny,
  GoalCompositeAll,
  GoalInvert,
  GoalFollow
}
