
class Move {
  constructor (x, y, z, remainingBlocks, cost, toBreak = [], toPlace = [], parkour = false) {
    this.x = Math.floor(x)
    this.y = Math.floor(y)
    this.z = Math.floor(z)
    this.remainingBlocks = remainingBlocks
    this.cost = cost
    this.toBreak = toBreak
    this.toPlace = toPlace
    this.parkour = parkour

    this.hash = this.x + ',' + this.y + ',' + this.z
  }
}

module.exports = Move
