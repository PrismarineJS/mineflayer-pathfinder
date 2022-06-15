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
   * @param { Object } [options={}] options - Optional Options.
   * @param { boolean } [options.dynamic=false] options.dynamic - setGoal's `dynamic` argument. Defaults to false.
   * @param { boolean } [options.allowPartial=false] options.allowPartial - If true, the goal will be executed with the best found path. Defaults to false.
   * @param { boolean } [options.silentPathCancel=false] options.silentPathCancel - Do not reject on `goal_updated` and `path_stop` events. Defaults to false.
   * @returns {Promise} - resolves on success, rejects on error
   */
function goto (bot, goal, options = {}) {
  return new Promise((resolve, reject) => {
    function goalReached () {
      cleanup()
    }

    function noPathListener (results) {
      if (results.path.length === 0) {
        cleanup()
      } else if (results.status === 'noPath' && !options.allowPartial) {
        cleanup(error('NoPath', 'No path to the goal!'))
      } else if (results.status === 'timeout' && !options.allowPartial) {
        cleanup(error('Timeout', 'Took to long to decide path to goal!'))
      }
      cleanup()
    }

    function goalChangedListener (newGoal) {
      if (newGoal !== goal) {
        if (options.silentPathCancel) cleanup()
        else cleanup(error('GoalChanged', 'The goal was changed before it could be completed!'))
      }
    }

    function pathStopped () {
      if (options.silentPathCancel) cleanup()
      else cleanup(error('PathStopped', 'Path was stopped before it could be completed! Thus, the desired goal was not reached.'))
    }

    function cleanup (err) {
      bot.removeListener('goal_reached', goalReached)
      bot.removeListener('path_update', noPathListener)
      bot.removeListener('goal_updated', goalChangedListener)
      bot.removeListener('path_stop', pathStopped)

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

    bot.on('path_stop', pathStopped)
    bot.on('goal_reached', goalReached)
    bot.on('path_update', noPathListener)
    bot.on('goal_updated', goalChangedListener)
    bot.pathfinder.setGoal(goal, options.dynamic ?? false)
  })
}

module.exports = goto
