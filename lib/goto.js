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
   * @returns {Promise} - resolves on success, rejects on error
   */
function goto (bot, goal) {
  return new Promise((resolve, reject) => {
    function goalReached () {
      cleanup()
    }

    function noPathListener (results) {
      if (results.path.length === 0) {
        cleanup()
      } else if (results.status === 'noPath') {
        cleanup(error('NoPath', 'No path to the goal!'))
      } else if (results.status === 'timeout') {
        cleanup()
      }
    }

    function goalChangedListener (newGoal) {
      if (newGoal !== goal) {
        cleanup(error('GoalChanged', 'The goal was changed before it could be completed!'))
      }
    }

    function cleanup (err) {
      bot.removeListener('goal_reached', goalReached)
      bot.removeListener('path_update', noPathListener)
      bot.removeListener('goal_updated', goalChangedListener)

      // Run callback on next event stack to let pathfinder properly cleanup,
      // otherwise chaining waypoints does not work properly.
      setTimeout(() => {
        if (err) {
          reject(err)
        } else {
          resolve()
        }
      }, 0)
    }

    bot.on('goal_reached', goalReached)
    bot.on('path_update', noPathListener)
    bot.on('goal_updated', goalChangedListener)
    bot.pathfinder.setGoal(goal)
  })
}

module.exports = goto
