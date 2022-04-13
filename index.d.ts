import { Bot } from 'mineflayer';
import { IndexedData } from 'minecraft-data';
import { Item } from 'prismarine-item';
import { Vec3 } from 'vec3';
import { Block } from 'prismarine-block';
import { Entity } from 'prismarine-entity';
import { World } from 'prismarine-world'
import AStar from './lib/astar';

declare module 'mineflayer-pathfinder' {
	export function pathfinder(bot: Bot): void;

	export interface Pathfinder {
		thinkTimeout: number;
		/** ms, amount of thinking per tick (max 50 ms) */
		tickTimeout: number;
		readonly goal: goals.Goal | null;
		readonly movements: Movements;

		bestHarvestTool(block: Block): Item | null;
		getPathTo(
			movements: Movements,
			goal: goals.Goal,
			timeout?: number
		): ComputedPath;
		getPathFromTo(
			movements: Movements,
			startPos: Vec3 | null, 
			goal: goals.Goal, 
			options?: {
				optimizePath?: boolean,
				timeout?: number,
				tickTimeout?: number,
				searchRadius?: number,
				startMove?: Move
			}
		): IterableIterator<{ result: ComputedPath, astarContext: AStar }>

		setGoal(goal: goals.Goal | null, dynamic?: boolean): void;
		setMovements(movements: Movements): void;
		goto(goal: goals.Goal, callback?: Callback): Promise<void>;
		stop(): void;

		isMoving(): boolean;
		isMining(): boolean;
		isBuilding(): boolean;
	}

	export namespace goals {
		export abstract class Goal {
			public abstract heuristic(node: Move): number;
			public abstract isEnd(node: Move): boolean;
			public abstract hasChanged(): boolean;
		}

		export class GoalBlock extends Goal {
			public constructor(x: number, y: number, z: number);

			public x: number;
			public y: number;
			public z: number;

			public heuristic(node: Move): number;
			public isEnd(node: Move): boolean;
			public hasChanged(): boolean;
		}

		export class GoalNear extends Goal {
			public constructor(x: number, y: number, z: number, range: number);

			public x: number;
			public y: number;
			public z: number;
			public rangeSq: number;

			public heuristic(node: Move): number;
			public isEnd(node: Move): boolean;
			public hasChanged(): boolean;
		}

		export class GoalXZ extends Goal {
			public constructor(x: number, z: number);

			public x: number;
			public z: number;

			public heuristic(node: Move): number;
			public isEnd(node: Move): boolean;
			public hasChanged(): boolean;
		}

		export class GoalNearXZ extends Goal {
			public constructor(x: number, z: number, range: number);

			public x: number;
			public z: number;
			public rangeSq: number;

			public heuristic(node: Move): number;
			public isEnd(node: Move): boolean;
			public hasChanged(): boolean;
		}

		export class GoalY extends Goal {
			public constructor(y: number);

			public y: number;

			public heuristic(node: Move): number;
			public isEnd(node: Move): boolean;
			public hasChanged(): boolean;
		}

		export class GoalGetToBlock extends Goal {
			public constructor(x: number, y: number, z: number);

			public x: number;
			public y: number;
			public z: number;

			public heuristic(node: Move): number;
			public isEnd(node: Move): boolean;
			public hasChanged(): boolean;
		}

		export class GoalCompositeAny extends Goal {
			public goals: Goal[];
			
			public push(goal: Goal): void;
			public heuristic(node: Move): number;
			public isEnd(node: Move): boolean;
			public hasChanged(): boolean;
		}

		export class GoalCompositeAll extends Goal {
			public goals: Goal[];

			public push(goal: Goal): void;
			public heuristic(node: Move): number;
			public isEnd(node: Move): boolean;
			public hasChanged(): boolean;
		}

		export class GoalInvert extends Goal {
			public constructor(goal: Goal);
			
			public goal: Goal;

			public heuristic(node: Move): number;
			public isEnd(node: Move): boolean;
			public hasChanged(): boolean;
		}

		export class GoalFollow extends Goal {
			public constructor(entity: Entity, range: number);

			public x: number;
			public y: number;
			public z: number;
			public entity: Entity;
			public rangeSq: number;

			public heuristic(node: Move): number;
			public isEnd(node: Move): boolean;
			public hasChanged(): boolean;
		}

		export class GoalPlaceBlock extends Goal {
			public heuristic(node: Move): number;
			public isEnd(node: Move): boolean;
			public hasChanged(): boolean;
			public constructor(pos: Vec3, world: World, options: GoalPlaceBlockOptions)
		}
		
		export class GoalLookAtBlock  extends Goal {
			public constructor(pos: Vec3, world: World, options?: { reach?: number, entityHeight?: number })
			
			public pos: Vec3

			public world: World;
			public heuristic(node: Move): number;
			public isEnd(node: Move): boolean;
			public hasChanged(): boolean;
		}

		export class GoalBreakBlock extends GoalLookAtBlock {}
	}

	export class Movements {
		public constructor(bot: Bot, mcData: IndexedData);

		public bot: Bot;

		public canDig: boolean;
		public dontCreateFlow: boolean;
		public dontMineUnderFallingBlock: boolean;
		public allow1by1towers: boolean;
		public allowFreeMotion: boolean;
		public allowParkour: boolean;
		public allowSprinting: boolean;
		
		public blocksCantBreak: Set<number>;
		public blocksToAvoid: Set<number>;
		public liquids: Set<number>;
		public gravityBlocks: Set<number>;
		public scafoldingBlocks: number[];

		public maxDropDown: number;
		public infiniteLiquidDropdownDistance: boolean;
		public digCost: number;
		public placeCost: number;

		/** Exclusion Area that adds extra cost or prevents the bot from stepping onto positions included.
		 * @example
		 * ```js
			movements.exclusionAreas = [(block) => {
				return block.type === someIdType ? 100 : 0 // Prevents the bot from breaking a specific block. By adding 100 to the cost.
			},
			(block) => {
				return someVec3Pos.distanceTo(block.position) < 5 ? 100 : 0 // Prevents the bot from getting near to a specific location
			}]
			``` */
		public exclusionAreasStep: [(block: SafeBlock) => number];
		/**
		 * Exclusion area for blocks to break. Works in the same way as {@link exclusionAreasStep} does. 
		 */
		public exclusionAreasBreak: [(block: SafeBlock) => number];
		/**
		 * Exclusion area for placing blocks. Note only works for positions not block values as placed blocks are determined by the bots inventory content. Works in the same way as {@link exclusionAreasStep} does. 
		 */
		public exclusionAreasPlace: [(block: SafeBlock) => number];

		public exclusionPlace(block: SafeBlock): number;
		public exclusionStep(block: SafeBlock): number;
		public exclusionBreak(block: SafeBlock): number;
		public countScaffoldingItems(): number;
		public getScaffoldingItem(): Item | null;
		public getBlock(pos: Vec3, dx: number, dy: number, dz: number): SafeBlock;
		public safeToBreak(block: SafeBlock): boolean;
		public safeOrBreak(block: SafeBlock): number;
		public getMoveJumpUp(node: Move, dir: XZCoordinates, neighbors: Move[]): void;
		public getMoveForward(node: Move, dir: XZCoordinates, neighbors: Move[]): void;
		public getMoveDiagonal(node: Move, dir: XZCoordinates, neighbors: Move[]): void;
		public getMoveDropDown(node: Move, dir: XZCoordinates, neighbors: Move[]): void;
		public getMoveParkourForward(node: Move, dir: XZCoordinates, neighbors: Move[]): void;
		public getMoveJumpUp(node: Move, dir: XZCoordinates, neighbors: Move[]): void;
		public getMoveUp(node: Move, neighbors: Move[]): void;
		public getMoveDown(node: Move, neighbors: Move[]): void;
		public getLandingBlock(node: Move, dir: XZCoordinates): SafeBlock;
		public getNeighbors(node: Move): Move[];
	}

	// this is a class, but its not exported so we use an interface
	export interface Move extends XYZCoordinates {
		remainingBlocks: number;
		cost: number;
		toBreak: Move[];
		toPlace: Move[];
		parkour: boolean;
		hash: string;
	}

	type Callback = (error?: Error) => void;

	export interface ComputedPath {
		status: 'noPath' | 'timeout' | 'success';
		cost: number;
		time: number;
		visitedNodes: number;
		generatedNodes: number;
		path: Move[];
	}

	export interface XZCoordinates {
		x: number;
		z: number;
	}

	export interface XYZCoordinates extends XZCoordinates {
		y: number;
	}

	export interface SafeBlock extends Block {
		safe: boolean;
		physical: boolean;
		liquid: boolean;
		height: number;
		replaceable: boolean;
		climbable: boolean;
		openable: boolean;
	}

	export interface GoalPlaceBlockOptions {
		range: number;
		LOS: boolean;
		faces: Vec3[];
		facing: 'north' | 'east' | 'south' | 'west' | 'up' | 'down';
	}
}

declare module 'mineflayer' {
	interface Bot {
		pathfinder: Pathfinder
	}
}
