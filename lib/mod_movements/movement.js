class Movement {
  constructor(position, hash) {
    this.position = position;
    this.hash = hash;
    this.actions = [];
  }
}

class Action {
  constructor(type, delta) {
    this.type = type;
    this.delta = delta;
  }
}

module.exports = { Movement, Action };
