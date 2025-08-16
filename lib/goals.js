const { Vec3 } = require('vec3')
const { getShapeFaceCenters } = require('./shapes')
const BOT_AABB = { halfW: 0.3, height: 1.8 } // player width 0.6, height ~1.8

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

  // Returns true if the goal is still valid for the goal,
  // for the GoalFollow this would be true if the entity is not null
  isValid () {
    return true
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
    // Treat the bot as an AABB and the goal as a sphere of radius sqrt(rangeSq).
    // AABB (in world coords) around the node:
    const minX = (node.x + 0.5) - BOT_AABB.halfW
    const maxX = (node.x + 0.5) + BOT_AABB.halfW
    const minY = node.y
    const maxY = node.y + BOT_AABB.height
    const minZ = (node.z + 0.5) - BOT_AABB.halfW
    const maxZ = (node.z + 0.5) + BOT_AABB.halfW

    // Sphere center at block center
    const cx = this.x + 0.5
    const cy = this.y + 0.5
    const cz = this.z + 0.5

    // Squared distance from sphere center to AABB
    let dx = 0; if (cx < minX) dx = (minX - cx); else if (cx > maxX) dx = (cx - maxX)
    let dy = 0; if (cy < minY) dy = (minY - cy); else if (cy > maxY) dy = (cy - maxY)
    let dz = 0; if (cz < minZ) dz = (minZ - cz); else if (cz > maxZ) dz = (cz - maxZ)
    const distSq = dx * dx + dy * dy + dz * dz
    return distSq <= this.rangeSq + 1e-9
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

// Useful for finding builds that you don't have an exact Y level for, just an approximate X and Z level
class GoalNearXZ extends Goal {
  constructor (x, z, range) {
    super()
    this.x = Math.floor(x)
    this.z = Math.floor(z)
    this.rangeSq = range * range
  }

  heuristic (node) {
    const dx = this.x - node.x
    const dz = this.z - node.z
    return distanceXZ(dx, dz)
  }

  isEnd (node) {
    const dx = this.x - node.x
    const dz = this.z - node.z
    return (dx * dx + dz * dz) <= this.rangeSq
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
    return Math.abs(dx) + Math.abs(dy < 0 ? dy + 1 : dy) + Math.abs(dz) === 1
  }
}

// Path into a position were a blockface of block at x y z is visible.
class GoalLookAtBlock extends Goal {
  constructor (pos, world, options = {}) {
    super()
    this.pos = pos
    this.world = world
    this.reach = options.reach || 4.5 // default survival: 4.5 creative: 5
    this.entityHeight = options.entityHeight || 1.6
  }

  heuristic (node) {
    const dx = node.x - this.pos.x
    const dy = node.y - this.pos.y
    const dz = node.z - this.pos.z
    return distanceXZ(dx, dz) + Math.abs(dy < 0 ? dy + 1 : dy)
  }

  isEnd (node) {
    const headPos = new Vec3(node.x + 0.5, node.y + this.entityHeight, node.z + 0.5)
    const block = this.world.getBlock(this.pos)
    if (!block) return false

    // Candidate outward normals for faces
    const normals = [
      new Vec3(1, 0, 0), new Vec3(-1, 0, 0),
      new Vec3(0, 1, 0), new Vec3(0, -1, 0),
      new Vec3(0, 0, 1), new Vec3(0, 0, -1)
    ]

    for (const n of normals) {
      // For each block shape, get the centers on this face
      let centers = []
      if (block.shapes && block.shapes.length > 0) {
        centers = getShapeFaceCenters(block.shapes, n)
      }
      // Fallback: center of the face on a full cube
      if (centers.length === 0) {
        centers = [new Vec3(0.5 + 0.5 * n.x, 0.5 + 0.5 * n.y, 0.5 + 0.5 * n.z)]
      }
      for (const c of centers) {
        const worldC = c.add(this.pos)
        const to = worldC.minus(headPos)
        const dist = to.norm()
        if (dist > this.reach) continue
        const dir = to.normalize()
        const hit = this.world.raycast(headPos, dir, this.reach)
        if (hit && hit.position &&
            hit.position.x === this.pos.x &&
            hit.position.y === this.pos.y &&
            hit.position.z === this.pos.z) {
          return true
        }
      }
    }
    return false
  }
}

// Path into a position were a blockface of block at x y z is visible.
// You'll manually need to break the block. THIS WONT BREAK IT
class GoalBreakBlock extends Goal {
  constructor (x, y, z, bot, options = {}) {
    super()
    this.goal = new GoalLookAtBlock(new Vec3(x, y, z), bot, options)
  }

  isEnd (node) {
    return this.goal.isEnd(node)
  }

  heuristic (node) {
    return this.goal.heuristic(node)
  }
}

// A composite of many goals, any one of which satisfies the composite.
// For example, a GoalCompositeAny of block goals for every oak log in loaded
// chunks would result in it pathing to the easiest oak log to get to
class GoalCompositeAny extends Goal {
  constructor (goals = []) {
    super()
    this.goals = goals
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

  isValid () {
    return this.goals.reduce((pre, curr) => pre && curr.isValid(), true)
  }
}

// A composite of many goals, all of them needs to be satisfied.
class GoalCompositeAll extends Goal {
  constructor (goals = []) {
    super()
    this.goals = goals
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

  isValid () {
    return this.goals.reduce((pre, curr) => pre && curr.isValid(), true)
  }
}

// Satisfy all sub-goals, but strictly in sequence (stable success semantics)
class GoalCompositeAllSequential extends Goal {
  constructor (goals = []) {
    super()
    this.goals = goals
    this._idx = 0
  }

  push (goal) {
    this.goals.push(goal)
  }

  _current () {
    return this.goals[this._idx] || null
  }

  heuristic (node) {
    const g = this._current()
    if (!g) return 0
    // Heuristic of current goal; remaining goals add no optimistic cost
    return g.heuristic(node)
  }

  isEnd (node) {
    const g = this._current()
    if (!g) return true
    if (g.isEnd(node)) {
      // advance; keep consuming if multiple goals already satisfied at this node
      while (this._idx < this.goals.length && this.goals[this._idx].isEnd(node)) this._idx++
      return this._idx >= this.goals.length
    }
    return false
  }

  hasChanged () {
    const g = this._current()
    return g ? g.hasChanged() : false
  }

  isValid () {
    return this.goals.reduce((pre, curr) => pre && curr.isValid(), true)
  }
}

class GoalInvert extends Goal {
  constructor (goal) {
    super()
    this.goal = goal
  }

  heuristic (node) {
    // Keep A* properties sane: heuristic must be non-negative and (ideally) admissible.
    const h = this.goal.heuristic(node)
    return h > 0 ? 0 : 0 // conservative (or use Math.max(0, -h) if you still want a gradient)
  }

  isEnd (node) {
    return !this.goal.isEnd(node)
  }

  hasChanged () {
    return this.goal.hasChanged()
  }

  isValid () {
    return this.goal.isValid()
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

  isValid () {
    return this.entity != null
  }
}

// Follow with last-seen fallback when the target unloads. Time-boxed memory.
class GoalFollowSticky extends Goal {
  constructor (entity, range, fallbackRadius = 3, memoryMs = 15000) {
    super()
    this.entity = entity
    this.rangeSq = range * range
    this.fallbackRadius = fallbackRadius
    this.memoryMs = memoryMs
    this._lastSeen = entity.position.floored()
    this._lastSeenAt = Date.now()
    this.x = this._lastSeen.x
    this.y = this._lastSeen.y
    this.z = this._lastSeen.z
  }

  _updateFromEntity () {
    if (this.entity && this.entity.position) {
      const p = this.entity.position.floored()
      this._lastSeen = p
      this._lastSeenAt = Date.now()
      this.x = p.x; this.y = p.y; this.z = p.z
      return true
    }
    return false
  }

  heuristic (node) {
    const dx = this.x - node.x
    const dy = this.y - node.y
    const dz = this.z - node.z
    return distanceXZ(dx, dz) + Math.abs(dy)
  }

  isEnd (node) {
    // If we have memory only, allow a looser radius
    const now = Date.now()
    const inMemory = (now - this._lastSeenAt) <= this.memoryMs
    const radiusSq = inMemory && !this._updateFromEntity() ? this.fallbackRadius * this.fallbackRadius : this.rangeSq
    const dx = this.x - node.x
    const dy = this.y - node.y
    const dz = this.z - node.z
    return (dx * dx + dy * dy + dz * dz) <= radiusSq
  }

  hasChanged () {
    if (this._updateFromEntity()) return true
    // stick to last seen; no change unless memory expires
    return false
  }

  isValid () {
    // valid while we still have fresh memory or have the entity
    if (this.entity) return true
    return (Date.now() - this._lastSeenAt) <= this.memoryMs
  }
}

function distanceXZ (dx, dz) {
  dx = Math.abs(dx)
  dz = Math.abs(dz)
  return Math.abs(dx - dz) + Math.min(dx, dz) * Math.SQRT2
}

/**
 * Options:
 * - range - maximum distance from the clicked face
 * - faces - the directions of the faces the player can click
 * - facing - the direction the player must be facing
 * - facing3D - boolean, facing is 3D (true) or 2D (false)
 * - half - 'top' or 'bottom', the half that must be clicked
 * - LOS - true or false, should the bot have line of sight off the placement face. Default true.
 */
class GoalPlaceBlock extends Goal {
  constructor (pos, world, options) {
    super()
    this.pos = pos.floored()
    this.world = world
    this.options = options
    if (!this.options.range) this.options.range = 5
    if (!('LOS' in this.options)) this.options.LOS = true
    if (!this.options.faces) {
      this.options.faces = [new Vec3(0, -1, 0), new Vec3(0, 1, 0), new Vec3(0, 0, -1), new Vec3(0, 0, 1), new Vec3(-1, 0, 0), new Vec3(1, 0, 0)]
    }
    this.options.facing = ['north', 'east', 'south', 'west', 'up', 'down'].indexOf(this.options.facing)
    this.facesPos = []
    for (const dir of this.options.faces) {
      const ref = this.pos.plus(dir)
      const refBlock = this.world.getBlock(ref)
      if (!refBlock) continue
      for (const center of getShapeFaceCenters(refBlock.shapes, dir.scaled(-1), this.options.half)) {
        this.facesPos.push([dir, center.add(ref), ref])
      }
    }
  }

  heuristic (node) {
    const dx = node.x - this.pos.x
    const dy = node.y - this.pos.y
    const dz = node.z - this.pos.z
    return distanceXZ(dx, dz) + Math.abs(dy < 0 ? dy + 1 : dy)
  }

  isEnd (node) {
    if (this.isStandingIn(node)) return false
    const headPos = node.offset(0.5, 1.6, 0.5)
    return this.getFaceAndRef(headPos) !== null
  }

  getFaceAndRef (headPos) {
    for (const [face, to, ref] of this.facesPos) {
      const dir = to.minus(headPos)
      if (dir.norm() > this.options.range) continue
      if (!this.checkFacing(dir)) continue

      if (!this.options.LOS) {
        return { face, to, ref }
      }

      const block = this.world.raycast(headPos, dir.normalize(), this.options.range)
      if (block && block.position.equals(ref) && block.face === vectorToDirection(face.scaled(-1))) {
        return { face, to, ref }
      }
    }
    return null
  }

  checkFacing (dir) {
    if (this.options.facing < 0) return true

    if (this.options.facing3D) {
      const dH = Math.sqrt(dir.x * dir.x + dir.z * dir.z)
      const vAngle = Math.atan2(dir.y, dH) * 180 / Math.PI
      if (vAngle > 45) return this.options.facing === 4
      if (vAngle < -45) return this.options.facing === 5
    }
    const angle = Math.atan2(dir.x, -dir.z) * 180 / Math.PI + 180 // Convert to [0,360[
    const facing = Math.floor(angle / 90 + 0.5) & 0x3

    if (this.options.facing === facing) return true
    return false
  }

  isStandingIn (node) {
    const dx = node.x - this.pos.x
    const dy = node.y - this.pos.y
    const dz = node.z - this.pos.z
    return (Math.abs(dx) + Math.abs(dy < 0 ? dy + 1 : dy) + Math.abs(dz)) < 1
  }
}

function vectorToDirection (v) {
  if (v.y < 0) {
    return 0
  } else if (v.y > 0) {
    return 1
  } else if (v.z < 0) {
    return 2
  } else if (v.z > 0) {
    return 3
  } else if (v.x < 0) {
    return 4
  } else if (v.x > 0) {
    return 5
  }
}

module.exports = {
  Goal,
  GoalBlock,
  GoalNear,
  GoalXZ,
  GoalNearXZ,
  GoalY,
  GoalGetToBlock,
  GoalCompositeAny,
  GoalCompositeAll,
  GoalCompositeAllSequential,
  GoalInvert,
  GoalFollow,
  GoalFollowSticky,
  GoalPlaceBlock,
  GoalBreakBlock,
  GoalLookAtBlock
}
