const { performance } = require('perf_hooks')

const Heap = require('./heap.js')

function reconstructPath (node) {
  const path = []
  while (node.parent) {
    node.data.x += 0.5
    node.data.z += 0.5
    path.push(node.data)
    node = node.parent
  }
  return path.reverse()
}

function hash (pos) {
  return Math.floor(pos.x) + ',' + Math.floor(pos.y) + ',' + Math.floor(pos.z)
}

function astar (start, getNeighbors, goal, timeout, done) {
  const startTime = performance.now()

  const closedDataSet = new Set()
  const openHeap = new Heap()
  const openDataMap = new Map()

  const startNode = {
    data: start,
    g: 0,
    h: goal.heuristic(start)
  }
  startNode.f = startNode.g + startNode.h
  // leave .parent undefined
  openHeap.push(startNode)
  openDataMap.set(hash(startNode.data), startNode)
  let bestNode = startNode

  while (!openHeap.isEmpty()) {
    if (performance.now() - startTime > timeout) {
      return done({
        status: 'timeout',
        cost: bestNode.g,
        time: performance.now() - startTime,
        path: reconstructPath(bestNode)
      })
    }
    const node = openHeap.pop()
    if (goal.isEnd(node.data)) {
      return done({
        status: 'success',
        cost: node.g,
        time: performance.now() - startTime,
        path: reconstructPath(node)
      })
    }
    // not done yet
    openDataMap.delete(hash(node.data))
    closedDataSet.add(hash(node.data))

    const neighbors = getNeighbors(node.data)
    for (const i in neighbors) {
      const neighborData = neighbors[i]
      if (closedDataSet.has(hash(neighborData))) {
        continue // skip closed neighbors
      }
      const gFromThisNode = node.g + neighborData.cost
      let neighborNode = openDataMap.get(hash(neighborData))
      var update = false

      if (neighborNode === undefined) {
        // add neighbor to the open set
        neighborNode = {}
        // properties will be set later
        openDataMap.set(hash(neighborData), neighborNode)
      } else {
        if (neighborNode.g < gFromThisNode) {
          // skip this one because another route is faster
          continue
        }
        update = true
      }
      // found a new or better route.
      // update this neighbor with this node as its new parent
      neighborNode.parent = node
      neighborNode.g = gFromThisNode
      neighborNode.h = goal.heuristic(neighborData)
      neighborNode.f = gFromThisNode + neighborNode.h
      // the data also carries the blocks to place and break, so update it
      neighborNode.data = neighborData
      if (neighborNode.h < bestNode.h) bestNode = neighborNode
      if (update) {
        openHeap.update(neighborNode)
      } else {
        openHeap.push(neighborNode)
      }
    }
  }
  // all the neighbors of every accessible node have been exhausted
  done({
    status: 'noPath',
    cost: bestNode.g,
    time: performance.now() - startTime,
    path: reconstructPath(bestNode)
  })
}

module.exports = astar
