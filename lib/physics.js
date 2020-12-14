const { PlayerState } = require('prismarine-physics')

class Physics {
  constructor (bot) {
    this.bot = bot
    this.world = { getBlock: (pos) => { return bot.blockAt(pos, false) } }
  }

  simulateUntil (goal, controller = () => {}, ticks = 1, state = null) {
    if (!state) {
      const simulationControl = {
        forward: this.bot.controlState.forward,
        back: this.bot.controlState.back,
        left: this.bot.controlState.left,
        right: this.bot.controlState.right,
        jump: this.bot.controlState.jump,
        sprint: this.bot.controlState.sprint,
        sneak: this.bot.controlState.sneak
      }
      state = new PlayerState(this.bot, simulationControl)
    }

    for (let i = 0; i < ticks; i++) {
      controller(state)
      this.bot.physics.simulatePlayer(state, this.world)
      if (goal(state)) return state
    }

    return state
  }

  simulateUntilNextTick () {
    return this.simulateUntil(() => false, () => {}, 1)
  }

  simulateUntilOnGround (ticks = 5) {
    return this.simulateUntil(state => state.onGround, () => {}, ticks)
  }

  canStraightLine (path, sprint = false) {
    const reached = this.getReached(path)
    const state = this.simulateUntil(reached, this.getController(path[0], false, sprint), 20)
    return reached(state)
  }

  canStraightLineBetween (n1, n2) {
    const reached = (state) => {
      const delta = n2.minus(state.pos)
      const r2 = 0.15 * 0.15
      return (delta.x * delta.x + delta.z * delta.z) <= r2 && Math.abs(delta.y) < 0.001 && (state.onGround || state.isInWater)
    }
    const simulationControl = {
      forward: this.bot.controlState.forward,
      back: this.bot.controlState.back,
      left: this.bot.controlState.left,
      right: this.bot.controlState.right,
      jump: this.bot.controlState.jump,
      sprint: this.bot.controlState.sprint,
      sneak: this.bot.controlState.sneak
    }
    const state = new PlayerState(this.bot, simulationControl)
    state.pos.update(n1)
    this.simulateUntil(reached, this.getController(n2, false, true), Math.floor(5 * n1.distanceTo(n2)), state)
    return reached(state)
  }

  canSprintJump (path) {
    const reached = this.getReached(path)
    const state = this.simulateUntil(reached, this.getController(path[0], true, true), 20)
    return reached(state)
  }

  canWalkJump (path) {
    const reached = this.getReached(path)
    const state = this.simulateUntil(reached, this.getController(path[0], true, false), 20)
    return reached(state)
  }

  getReached (path) {
    return (state) => {
      const delta = path[0].minus(state.pos)
      const r2 = 0.15 * 0.15
      return (delta.x * delta.x + delta.z * delta.z) <= r2 && Math.abs(delta.y) < 0.001 && (state.onGround || state.isInWater)
    }
  }

  getController (nextPoint, jump, sprint) {
    return (state) => {
      const dx = nextPoint.x - state.pos.x
      const dz = nextPoint.z - state.pos.z
      state.yaw = Math.atan2(-dx, -dz)

      state.control.forward = true
      state.control.jump = jump
      state.control.sprint = sprint
    }
  }
}

module.exports = Physics
