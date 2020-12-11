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

  canStraightLine (nextPoint, sprint = false) {
    const reached = this.getReached(nextPoint)
    const state = this.simulateUntil(reached, this.getController(nextPoint, false, sprint), 20)
    return reached(state)
  }

  canSprintJump (nextPoint) {
    const reached = this.getReached(nextPoint)
    const state = this.simulateUntil(reached, this.getController(nextPoint, true, true), 20)
    return reached(state)
  }

  canWalkJump (nextPoint) {
    const reached = this.getReached(nextPoint)
    const state = this.simulateUntil(reached, this.getController(nextPoint, true, false), 20)
    return reached(state)
  }

  getReached (nextPoint) {
    return (state) => {
      const dx = nextPoint.x - state.pos.x
      const dy = nextPoint.y - state.pos.y
      const dz = nextPoint.z - state.pos.z
      const r2 = 0.15 * 0.15
      return (dx * dx + dz * dz) <= r2 && Math.abs(dy) < 0.001 && (state.onGround || state.isInWater)
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
