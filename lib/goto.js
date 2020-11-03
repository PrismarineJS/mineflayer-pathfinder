function error (name, message) {
  const err = new Error(message)
  err.name = name
  return err
}

/**
 * Adds a easy-to-use API wrapper for quickly executing a goal and running
 * a callback when that goal is reached. This function serves to remove a
 * lot of boilerplate code for quickly executing a goal.
 * 
 * @param {Bot} bot - The bot.
 * @param {Goal} goal - The goal to execute.
 * @param {Callback} cb - The callback.
 */
function goto (bot, goal, cb) {
  function noPathListener (results) {
    if (results.status !== 'noPath') return
    cleanup(error('NoPath', 'No path to the goal!'))
  }

  function goalChangedListener (newGoal) {
    if (newGoal === goal) return
    cleanup(error('GoalChanged', 'The goal was changed before it could be completed!'))
  }

  function cleanup (err) {
    bot.removeListener('goal_reached', cleanup)
    bot.removeListener('path_update', noPathListener)
    bot.removeListener('goal_updated', goalChangedListener)
    cb(err)
  }

  bot.on('goal_reached', cleanup)
  bot.on('path_update', noPathListener)
  bot.on('goal_updated', goalChangedListener)
  bot.pathfinder.setGoal(goal)
}

module.exports = goto