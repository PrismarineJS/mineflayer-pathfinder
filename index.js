const { performance } = require('perf_hooks');
const { Vec3 } = require('vec3');
const Movements = require('./lib/Movements');
const { AStar, PathNode } = require('./lib/AStar');
const Move = requrie('./lib/Move');
const { EventEmitter } = require('events');
const goals = require('./lib/goals');
const { PlayerState } = require('prismarine-physics');
const nbt = require('prismarine-nbt');

const POINT_15_SQ = 0.15 * 0.15;

export class PathFinder extends EventEmitter {
	constructor(bot, movements = new Movements(bot)) {
		super();
		Object.defineProperty(this, 'bot', { value: bot });
		this._blockUpdateListener = this._blockUpdateListener.bind(this);
		this._chunkColumnLoadListener = this._chunkColumnLoadListener.bind(this);
		this._tickListener = this._tickListener.bind(this);

		this.thinkTimeout = 40; // ms

		this.currentGoal = null;
		this.digging = false;
		this.placing = false;
		this.thinking = false;

		this.dynamicGoal = false;
		this.path = [];
		this.pathUpdated = false;
		this.placingBlock = null;
		this.lastNodeTime = performance.now();

		this._listenersAttached = false;

		this.movements = movements;
	}

	get moving() {
		return this.path.length > 0 || this.thinking;
	}

	get mining() {
		return this.digging;
	}

	get building() {
		return this.placing;
	}

	bestHarvestTool(block) {
		const { effects } = this.bot.entity;

		let fastest = Number.MAX_VALUE;
		let best = null;
		for (const tool of this.bot.inventory.items()) {
			const enchants = tool.nbt ? nbt.simplify(tool.nbt).Enchantments : [];
			const digTime = block.digTime(tool ? tool.type : null, false, false, false, enchants, effects);

			if (digTime < fastest) {
				fastest = digTime;
				best = tool;
			}
		}

		return best;
	}

	getPathTo(movements, goal, timeout) {
		const { position } = this.bot.entity;
		const start = new Move(
			position.x, position.y, position.z,
			movements.countScaffoldingItems(), 0
		);
		return new AStar(start, movements, goal, timeout || this.thinkTimeout).compute();
	}

	setGoal(goal, dynamic = false) {
		if (this.currentGoal !== null) {
			this.emit('goal_cancelled', goal, dynamic);
		}
		this.currentGoal = goal;
		this.dynamicGoal = dynamic;
		if (goal !== null) {
			if (!this._listenersAttached) this._addListeners();
			this.emit('new_goal', goal, dynamic);
		} else if (this._listenersAttached) {
			this._removeListeners();
		}
		this.resetPath();
		return goal;
	}

	setMovements(movements) {
		this.movements = movements;
		this.resetPath();
		return movements;
	}

	isPositionNearPath(position, path = this.path) {
		return path.some(node => {
			const dx = Math.abs(node.x - position.x);
			if (dx > 1) return false;
			const dy = Math.abs(node.y - position.y);
			if (dy > 2) return false;
			const dz = Math.abs(node.z - position.z);
			return dz <= 1;
		});
	}

	resetPath(clearControlStates = true) {
		this.path = [];
		if (this.digging) {
			this.bot.stopDigging();
			this.digging = false;
		}
		this.placing = false;
		this.pathUpdated = false;
		if (clearControlStates) {
			this.bot.clearControlStates();
		}
	}

	getPositionOntopOf(block) {
		if (!block || !block.shapes || block.shapes.length === 0) return null;
		let x = 0.5, y = 0, z = 0.5;
		let n = 1;
		for (const shape of block.shapes) {
			const highest = shape[4];
			if (highest === y) {
				x += (shape[0] + shape[3]) / 2;
				z += (shape[2] + shape[5]) / 2;
				n++;
			} else if (highest > y) {
				n = 2;
				x = 0.5 + (shape[0] + shape[3]) / 2;
				y = highest;
				z = 0.5 + (shape[2] + shape[5]) / 2;
			}
		}
		return block.position.offset(
			x / n,
			y,
			z / n
		)
	}

	fullStop() {
		this.bot.clearControlStates();

		const { position, velocity } = this.bot.entity;

		// Force horizontal velocity to 0 (otherwise inertia can move us too far)
		// Kind of cheaty, but the server will not tell the difference
		velocity.x = 0;
		velocity.z = 0;

		const blockX = Math.floor(position.x) + 0.5;
		const blockZ = Math.floor(position.z) + 0.5;

		// Make sure our bounding box don't collide with neighboring blocks
		// otherwise recenter the position
		if (Math.abs(position.x - blockX) > 0.2) {
			position.x = blockX;
		}
		if (Math.abs(position.z - blockZ) > 0.2) {
			position.z = blockZ;
		}
	}

	async _tickListener() {
		try {
			await this.monitorMovement();
		} catch (error) {
			this.emit('error', error);
		}
	}

	async monitorMovement() {
		const { bot, currentGoal: goal } = this;
		if (!goal) return;
		if (goal instanceof GoalFollow && this.movements.allowFreeMotion) {
			const target = goal.entity;
			if (!target.isValid) {
				this.emit('goal_reached', goal, this.dynamicGoal);
				this.currentGoal = null;
				this.dynamicGoal = false;
				return;
			}
			if (this.canStraightPathTo(target.position)) {
				bot.lookAt(target.position.offset(0, 1.6, 0), false, () => {
					if (target.position.distanceTo(bot.entity.position) > Math.sqrt(goal.rangeSq)) {
						bot.setControlState('forward', true);
						bot.setControlState('sprint', true);
					} else {
						bot.clearControlStates();
					}
				});
				return;
			}
		}

		if (goal.hasChanged()) this.resetPath();

		if (this.path.length === 0) {
			this.lastNodeTime = performance.now();
			if (!this.thinking) {
				if (goal.isEnd(bot.entity.position.floored())) {
					this.emit('goal_reached', goal, this.dynamicGoal);
					this.currentGoal = null;
					this.dynamicGoal = false;
				} else if (!this.pathUpdated) {
					this.thinking = true
					const data = this.getPathTo(this.movements, goal);
					this.emit('path_update', goal, data);
					this.path = data.path;
					this.thinking = false;
					this.pathUpdated = true;
				}
			}
			return;
		}

		// Handle digging
		if (this.digging) return;

		const equip = tool => new Promise((resolve, reject) => bot.equip(tool, 'hand', error => {
			if (error) reject(error);
			else resolve();
		}));

		let nextPoint = this.path[0];

		if (nextPoint.toBreak.length > 0 && bot.entity.onGround) {
			this.digging = true;
			const { x, y, z } = nextPoint.toBreak.shift();
			const point = new Vec3(x, y, z);
			const block = bot.blockAt(point);
			if (!block) {
				bot.emit('warn', `Attempted to get a block at ${point.toString()}, but couldn't`);
				return;
			}
			const tool = bot.pathfinder.bestHarvestTool(block);
			this.fullStop();
			if (tool) {
				await equip(tool);
			}
			return new Promise((resolve, reject) => bot.dig(block, error => {
				this.lastNodeTime = performance.now();
				this.digging = false;
				if (error) {
					this.resetPath();
					reject(error);
				} else {
					resolve();
				}
			}));
		}

		if (this.placing) return;
		// Handle block placement
		// TODO: sneak when placing or make sure the block is not interactive
		if (nextPoint.toPlace.length > 0) {
			this.placing = true;
			const placingBlock = this.placingBlock = nextPoint.toPlace.shift();
			this.fullStop();
			const item = this.movements.getScaffoldingItem();
			if (!item) return this.resetPath();
			let canPlace = true
			if (placingBlock.jump) {
				bot.setControlState('jump', true);
				canPlace = placingBlock.y + 1 < bot.entity.position.y;
			}
			if (canPlace) {
				await equip(item);
				const reference = new Vec3(placingBlock.x, placingBlock.y, placingBlock.z);
				const facing = new Vec3(placingBlock.dx, placingBlock.dy, placingBlock.dz);
				return new Promise((resolve, reject) => bot.placeBlock(reference, facing, error => {
					this.lastNodeTime = performance.now();
					this.placing = false;
					if (error) {
						this.resetPath();
						reject(error);
					} else {
						resolve();
					}
				}));
			}
			return;
		}

		const _nextPoint =
			this.getPositionOntopOf(bot.blockAt(new Vec3(nextPoint.x, nextPoint.y, nextPoint.z))) ||
			this.getPositionOntopOf(bot.blockAt(new Vec3(nextPoint.x, nextPoint.y - 1, nextPoint.z)));
		if (_nextPoint) {
			nextPoint.x = _nextPoint.x;
			nextPoint.y = _nextPoint.y;
			nextPoint.z = _nextPoint.z;
		} else {
			nextPoint.x = Math.floor(nextPoint.x) + 0.5;
			nextPoint.z = Math.floor(nextPoint.z) + 0.5;
		}

		const { position } = bot.entity;

		const dx = nextPoint.x - position.x;
		const dy = nextPoint.y - position.y;
		const dz = nextPoint.z - position.z;

		const dx_dz_total = dx * dx + dz * dz;
		if (dx_dz_total <= POINT_15_SQ && (bot.entity.onGround || bot.entity.isInWater)) {
			// arrived at next point
			this.lastNodeTime = performance.now();
			this.path.shift();
			if (this.path.length === 0) { // done
				if (!this.dynamicGoal && goal.isEnd(position.floored())) {
					this.emit('goal_reached', goal, this.dynamicGoal);
					this.currentGoal = null;
					this.dynamicGoal = false;
				}
				this.fullStop();
				return;
			}
			// not done yet
			nextPoint = this.path[0];
			if (nextPoint.toBreak.length > 0 || nextPoint.toPlace.length > 0) {
				this.fullStop()
			}
			return;
		}

		let gottaJump = false;
		const horizontalDelta = Math.sqrt(dx_dz_total);

		if (dy > 0.6) {
			// gotta jump up when we're close enough
			gottaJump = horizontalDelta < 1.75;
		} else if (dy > -0.1 && nextPoint.parkour) {
			// possibly jump over a hole
			gottaJump = horizontalDelta > 1.5 && horizontalDelta < 2.5;
		}
		gottaJump = gottaJump || bot.entity.isInWater;
		bot.setControlState('jump', gottaJump);

		// run toward next point
		return new Promise((resolve, reject) => {
			bot.look(Math.atan2(-dx, -dz), 0, false, error => {
				if (error) {
					reject(error);
					return;
				}
				const lx = -Math.sin(bot.entity.yaw);
				const lz = -Math.cos(bot.entity.yaw);

				const forwards = (lx * dx + lz * dz) > 0;

				bot.setControlState('forward', forwards);
				bot.setControlState('sprint', forwards);
				bot.setControlState('back', !forwards);

				// check for futility
				if (performance.now() - this.lastNodeTime > 1500) {
					// should never take this long to go to the next node
					this.resetPath();
				}
				resolve();
			});
		});
	}

	_blockUpdateListener(oldBlock, newBlock) {
		try {
			if (!oldBlock || oldBlock.type === newBlock.type || !this.isPositionNearPath(oldBlock.position)) return;
			this.resetPath(false);
		} catch (error) {
			this.emit('error', error);
		}
	}

	_chunkColumnLoadListener() {
		this.resetPath();
	}

	canStraightPathTo(position) {
		const state = new PlayerState(this.bot, {
			forward: true,
			back: false,
			left: false,
			right: false,
			jump: false,
			sprint: false,
			sneak: false
		})
		const delta = position.minus(this.bot.entity.position);
		state.yaw = Math.atan2(-delta.x, -delta.z);
		for (let step = 0; step < 1000; step++) {
			// @ts-ignore
			this.bot.physics.simulatePlayer(state, {
				getBlock: pos => this.bot.blockAt(pos)
			});
			if (position.distanceTo(state.pos) <= 2) return true;
			// TODO: check blocks to avoid
			if (!state.onGround || state.isCollidedHorizontally) return false;
		}
		return false;
	}

	_addListeners() {
		this._listenersAttached = true;
		const { bot } = this;
		bot.on('physicTick', this._tickListener);
		bot.on('blockUpdate', this._blockUpdateListener);
		bot.on('chunkColumnLoad', this._chunkColumnLoadListener);
	}

	_removeListeners() {
		this._listenersAttached = false;
		const { bot } = this;
		bot.off('physicTick', this._tickListener);
		bot.off('blockUpdate', this._blockUpdateListener);
		bot.off('chunkColumnLoad', this._chunkColumnLoadListener);
	}
}

const inject = bot => bot.pathfinder = new PathFinder(bot);

module.exports = {
	inject,
	AStar,
	Constants: require('./lib/constants'),
	goals,
	Move,
	Movements,
	PathFinder,
	PathNode
};