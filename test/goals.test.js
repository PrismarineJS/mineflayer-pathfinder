/* eslint-env mocha */

const assert = require('assert')
const { GoalCompositeAll, GoalCompositeAny, GoalInvert, Goal } = require('../lib/goals.js')

class ConstGoal extends Goal {
  constructor (h, end = false) {
    super()
    this.h = h
    this.end = end
  }

  heuristic () { return this.h }
  isEnd () { return this.end }
}

describe('GoalCompositeAll.heuristic', function () {
  it('returns exactly 0 when every sub-goal heuristic is already 0', function () {
    const goal = new GoalCompositeAll([new ConstGoal(0), new ConstGoal(0)])
    assert.strictEqual(goal.heuristic({}), 0)
  })

  it('returns the true max, including a negative value from a nested GoalInvert', function () {
    // GoalInvert.heuristic() negates its wrapped goal's heuristic, so it's a
    // real, legitimate source of negative sub-goal heuristics.
    const goal = new GoalCompositeAll([new GoalInvert(new ConstGoal(5)), new ConstGoal(3)])
    // sub-heuristics are -5 and 3; max is 3
    assert.strictEqual(goal.heuristic({}), 3)
  })

  it('returns the true (negative) max when every sub-goal heuristic is negative', function () {
    const goal = new GoalCompositeAll([new GoalInvert(new ConstGoal(5)), new GoalInvert(new ConstGoal(1))])
    // sub-heuristics are -5 and -1; max is -1, not 0
    assert.strictEqual(goal.heuristic({}), -1)
  })

  it('does not crash on an empty goal list', function () {
    const goal = new GoalCompositeAll([])
    assert.strictEqual(goal.heuristic({}), -Infinity)
  })
})

describe('GoalCompositeAny.heuristic (sanity check, unchanged)', function () {
  it('returns the true min across sub-goals', function () {
    const goal = new GoalCompositeAny([new ConstGoal(7), new ConstGoal(2)])
    assert.strictEqual(goal.heuristic({}), 2)
  })
})
