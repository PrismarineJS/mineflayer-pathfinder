/* eslint-env mocha */

const assert = require('assert')
const { Vec3 } = require('vec3')
const { GoalLookAtBlock } = require('../lib/goals')

describe('GoalLookAtBlock reach', () => {
  it('measures from the eyes to a block above the player', () => {
    const target = new Vec3(0, 6, 0)
    const world = { raycast: () => ({ position: target }) }
    const goal = new GoalLookAtBlock(target, world, { reach: 4.5 })

    assert.strictEqual(goal.isEnd(new Vec3(0, 0, 0)), true)
    assert.strictEqual(goal.isEnd(new Vec3(0, -1, 0)), false)
  })
})
