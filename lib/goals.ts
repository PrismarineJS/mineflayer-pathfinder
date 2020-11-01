import { Entity } from 'prismarine-entity';
import { Vec3 } from 'vec3';

// Goal base class
export abstract class Goal {
  // Return the distance between node and the goal
  public abstract heuristic(node: { x: number; y: number, z: number }): number

  // Return true if the node has reach the goal
  public abstract isEnd(node: { x: number; y: number, z: number }): boolean;

  // Return true if the goal has changed and the current path
  // should be invalidated and computed again
  public hasChanged() {
		return false;
	};
}

// One specific block that the player should stand inside at foot level
export class GoalBlock extends Goal {
	public x: number;
	public y: number;
	public z: number;

  public constructor(x: number, y: number, z: number) {
    super();
    this.x = Math.floor(x);
    this.y = Math.floor(y);
    this.z = Math.floor(z);
  }

  public heuristic(node: Vec3) {
    const dx = this.x - node.x;
    const dy = this.y - node.y;
    const dz = this.z - node.z;
    return distanceXZ(dx, dz) + Math.abs(dy);
  }

  public isEnd(node: Vec3) {
    return node.x === this.x && node.y === this.y && node.z === this.z;
  }
}

// A block position that the player should get within a certain radius of, used for following entities
export class GoalNear extends Goal {
	public x: number;
	public y: number;
	public z: number;
	public rangeSq: number;

  public constructor (x: number, y: number, z: number, range: number) {
    super();
    this.x = Math.floor(x);
    this.y = Math.floor(y);
    this.z = Math.floor(z);
    this.rangeSq = range * range;
  }

  public heuristic(node: Vec3) {
    const dx = this.x - node.x;
    const dy = this.y - node.y;
    const dz = this.z - node.z;
    return distanceXZ(dx, dz) + Math.abs(dy);
  }

  public isEnd(node: Vec3) {
    const dx = this.x - node.x;
    const dy = this.y - node.y;
    const dz = this.z - node.z
    return (dx * dx + dy * dy + dz * dz) <= this.rangeSq
  }
}

// Useful for long-range goals that don't have a specific Y level
export class GoalXZ extends Goal {
	public x: number;
	public z: number;
	
	public constructor (x: number, z: number) {
    super();
    this.x = Math.floor(x);
    this.z = Math.floor(z);
  }

  public heuristic(node: Vec3) {
    const dx = this.x - node.x;
    const dz = this.z - node.z;
    return distanceXZ(dx, dz);
  }

  public isEnd(node: Vec3) {
    return node.x === this.x && node.z === this.z;
  }
}

// Goal is a Y coordinate
export class GoalY extends Goal {
	public y: number;
	
	public constructor(y: number) {
    super();
    this.y = Math.floor(y);
  }

  public heuristic(node: Vec3) {
    const dy = this.y - node.y;
    return Math.abs(dy);
  }

  public isEnd(node: Vec3) {
    return node.y === this.y;
  }
}

// Don't get into the block, but get directly adjacent to it. Useful for chests.
export class GoalGetToBlock extends Goal {
	public x: number;
	public y: number;
	public z: number;

  public constructor(x: number, y: number, z: number) {
    super();
    this.x = Math.floor(x);
    this.y = Math.floor(y);
    this.z = Math.floor(z);
  }

  public heuristic(node: Vec3) {
    const dx = node.x - this.x;
    const dy = node.y - this.y;
    const dz = node.z - this.z;
    return distanceXZ(dx, dz) + Math.abs(dy < 0 ? dy + 1 : dy);
  }

  public isEnd(node: Vec3) {
    const dx = node.x - this.x;
    const dy = node.y - this.y;
    const dz = node.z - this.z;
    return Math.abs(dx) + Math.abs(dy < 0 ? dy + 1 : dy) + Math.abs(dz) <= 1;
  }
}

// A composite of many goals, any one of which satisfies the composite.
// For example, a GoalCompositeAny of block goals for every oak log in loaded
// chunks would result in it pathing to the easiest oak log to get to
export class GoalCompositeAny extends Goal {
	public goals: Goal[];

  public constructor() {
    super();
    this.goals = [];
  }

  public push(goal: Goal) {
    this.goals.push(goal);
  }

  public heuristic(node: Vec3) {
    return this.goals.reduce(
			(min, goal) => Math.min(min, goal.heuristic(node)),
			Number.MAX_VALUE
		);
  }

  public isEnd(node: Vec3) {
    return this.goals.some(goal => goal.isEnd(node));
  }

  public hasChanged() {
    return this.goals.some(goal => goal.hasChanged());
  }
}

// A composite of many goals, all of them needs to be satisfied.
export class GoalCompositeAll extends Goal {
	public goals: Goal[];

  public constructor() {
    super();
    this.goals = [];
  }

  public push(goal: Goal) {
    this.goals.push(goal);
  }

  public heuristic(node: Vec3) {
    return this.goals.reduce(
			(max, goal) => Math.max(max, goal.heuristic(node)),
			Number.MIN_VALUE
		);
  }

  public isEnd(node: Vec3) {
    return this.goals.every(goal => goal.isEnd(node));
  }

  public hasChanged() {
    return this.goals.some(goal => goal.hasChanged());
  }
}

export class GoalInvert extends Goal {
	public goal: Goal;

  public constructor(goal: Goal) {
    super();
    this.goal = goal;
  }

  public heuristic(node: Vec3) {
    return -this.goal.heuristic(node);
  }

  public isEnd(node: Vec3) {
    return !this.goal.isEnd(node);
  }

  public hasChanged() {
    return this.goal.hasChanged();
  }
}

export class GoalFollow extends Goal {
	public x: number;
	public y: number;
	public z: number;
	public rangeSq: number;

  public constructor(
		public entity: Entity,
		range: number
	) {
    super();
    this.entity = entity;
    this.x = Math.floor(entity.position.x);
    this.y = Math.floor(entity.position.y);
    this.z = Math.floor(entity.position.z);
    this.rangeSq = range * range;
  }

  public heuristic(node: Vec3) {
    const dx = this.x - node.x;
    const dy = this.y - node.y;
    const dz = this.z - node.z;
    return distanceXZ(dx, dz) + Math.abs(dy);
  }

  public isEnd(node: Vec3) {
		if (!this.entity.position) return true;
    const dx = this.x - node.x;
    const dy = this.y - node.y;
    const dz = this.z - node.z;
    return (dx * dx + dy * dy + dz * dz) <= this.rangeSq;
  }

  public hasChanged() {
		if (!this.entity.position) return false;
    const p = this.entity.position.floored()
    const dx = this.x - p.x
    const dy = this.y - p.y
    const dz = this.z - p.z
    if ((dx * dx + dy * dy + dz * dz) > this.rangeSq) {
      this.x = p.x
      this.y = p.y
      this.z = p.z
      return true
    }
    return false
  }
}

const distanceXZ = (dx: number, dz: number) => {
  dx = Math.abs(dx);
  dz = Math.abs(dz);
  return Math.abs(dx - dz) + Math.min(dx, dz) * Math.SQRT2
}