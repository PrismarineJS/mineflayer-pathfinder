import { Vec3 } from 'vec3';
import { Bot } from 'mineflayer';
import { EventEmitter } from 'events';
import { IndexedData } from 'minecraft-data';
import { Item } from 'prismarine-item';
import { Block } from 'prismarine-block';
import { Entity } from 'prismarine-entity';

declare module 'mineflayer-pathfinder' {
	export const pathfinder: (bot: Bot) => PathFinder;

	export namespace goals {
		export abstract class Goal {
			public heuristic(node: CoordinatesObject): number
			public isEnd(node: CoordinatesObject): boolean;
			public hasChanged(): boolean;
		}
		
		export class GoalBlock extends Goal {
			public x: number;
			public y: number;
			public z: number;
		
			public constructor(x: number, y: number, z: number);
		}
		
		export class GoalNear extends Goal {
			public x: number;
			public y: number;
			public z: number;
			public rangeSq: number;
		
			public constructor(x: number, y: number, z: number, range: number);
		}
		
		export class GoalXZ extends Goal {
			public x: number;
			public z: number;
			
			public constructor (x: number, z: number);
		}
		
		export class GoalY extends Goal {
			public y: number;
			
			public constructor(y: number);
		}
		
		export class GoalGetToBlock extends Goal {
			public x: number;
			public y: number;
			public z: number;
		
			public constructor(x: number, y: number, z: number);
		}
		
		export class GoalCompositeAny extends Goal {
			public goals: Goal[];
		}
		
		export class GoalCompositeAll extends Goal {
			public goals: Goal[];
		}
		
		export class GoalInvert extends Goal {
			public goal: Goal;
		
			public constructor(goal: Goal);
		}
		
		export class GoalFollow extends Goal {
			public x: number;
			public y: number;
			public z: number;
			public rangeSq: number;
			public entity: Entity;
		
			public constructor(entity: Entity, range: number);
		}
	}

	export class AStar {
		public startTime: number;
	
		public closedDataSet: Set<string>;
		public openHeap: BinaryHeapOpenSet;
		public openDataMap: Map<string, PathNode>;
	
		public bestNode: PathNode;

		public movements: Movements;
		public goal: goals.Goal;
		public timeout: number;
	
		public constructor(
			start: Move,
			movements: Movements,
			goal: goals.Goal,
			timeout: number
		);
	
		public makeResult(status: string, node: PathNode): ComputedData;
		public compute(): ComputedData;
	}

	class BinaryHeapOpenSet {
		public heap: (PathNode | null)[];

		public size(): number;
		public isEmpty(): boolean;
		public push(val: PathNode): void;
		public update(val: PathNode): void;
		public pop(): PathNode;
	}

	export class Move {
		public x: number;
		public y: number;
		public z: number;

		public remainingBlocks: number;
		public cost: number;
		public toBreak: DCoordinatesObject[];
		public toPlace: DCoordinatesObject[];
		public parkour: boolean;

		public readonly hash: string;
	
		public constructor(
			x: number, y: number, z: number,
			remainingBlocks: number,
			cost: number,
			toBreak?: DCoordinatesObject[],
			toPlace?: DCoordinatesObject[],
			parkour?: boolean
		);
	}

	export class Movements {
		public readonly bot: Bot;
		public digCost: number;
		public maxDropDown: number;

		public dontCreateFlow: boolean;
		public allow1by1towers: boolean;
		public allowFreeMotion: boolean;
		public allowParkour: boolean;
		
		public immuneBlocks: Set<number>;
		public avoidBlocks: Set<number>;
		public liquids: Set<number>;
		public scaffoldingBlocks: Set<number>;
		
		public constructor(bot: Bot, minecraftData?: IndexedData);
	
		public countScaffoldingItems(): number;
		public getScaffoldingItem(): Item | null;
		public getBlock(position: CoordinatesObject | null, dx: number, dy: number, dz: number): SafeBlock;
		public safeToBreak(block: Block): boolean;
		public safeOrBreak({ safe, block }: SafeBlock, toBreak: CoordinatesObject[]): number;
		public getMoveJumpUp(node: Move, dir: DirectionCoordinates, neighbors: Move[]): void;
		public getMoveForward(node: Move, dir: DirectionCoordinates, neighbors: Move[]): void;
		public getMoveDiagonal(node: Move, dir: DirectionCoordinates, neighbors: Move[]): void;
		public getLandingBlock(node: Move, dir: DirectionCoordinates): SafeBlock;
		public getMoveDropDown(node: Move, dir: DirectionCoordinates, neighbors: Move[]): void;
		public getMoveDown(node: Move, neighbors: Move[]): void;
		public getMoveUp(node: Move, neighbors: Move[]): void;
		public getMoveParkourForward(node: Move, dir: DirectionCoordinates, neighbors: Move[]): void;
		public getNeighbors(node: Move): void;
	}

	export class PathFinder extends EventEmitter {
		private dynamicGoal: boolean;
		private path: Move[];
		private pathUpdated: boolean;
		private placingBlock: DCoordinatesObject | null;
		private lastNodeTime: number;
		private _listenersAttached: boolean;

		public readonly bot: Bot;
		public thinkTimeout: number;
		public currentGoal: goals.Goal | null;
		public digging: boolean;
		public placing: boolean;
		public thinking: boolean;
		public movements: Movements;

		public readonly moving: boolean;

		public on(event: 'path_update', listener: (goal: goals.Goal, data: ComputedData) => void): this;
		public on(event: 'new_goal', listener: (goal: goals.Goal, dynamic: boolean) => void): this;
		public on(event: 'goal_cancelled', listener: (goal: goals.Goal, dynamic: boolean) => void): this;
		public on(event: 'goal_reached', listener: (goal: goals.Goal, dynamic: boolean) => void): this;
		public on(event: string, listener: (...args: any[]) => void): this;

		private _addListeners(): void;
		private _removeListeners(): void;
		private _chunkColumnLoadListener(): void;
		private _blockUpdateListener(oldBlock: Block | null, newBlock: Block): void;
		private _tickListener(): Promise<void>;
		private resetPath(clearControlStates?: boolean): void;
		private getPositionOntopOf(block: (Block & { shapes?: number[][] }) | null): Vec3;
		private fullStop(): void;
		private monitorMovement(): Promise<void>;
		private canStraightPathTo(position: Vec3): boolean;

		public isMining(): boolean;
		public isBuilding(): boolean;
		public bestHarvestTool(block: Block): Item;
		public getPathTo(movements: Movements, goal: goals.Goal, timeout?: number): ComputedData;
		public goto(goal: goals.Goal, callback: (error?: Error) => void): void;
		public setGoal<T extends goals.Goal | null>(goal: T, dynamic?: boolean): T
		public setMovements(movements: Movements): Movements;
		public isPositionNearPath(position: Vec3, path?: Move[]): boolean;
	}

	export class PathNode {
		public data: Move | null;
		public g: number;
		public h: number;
		public f: number;
		public parent: PathNode | null;
	
		public set(data: Move, g: number, h: number, parent?: PathNode | null): this;
	}

	export interface ComputedData {
		status: string;
		cost: number;
		time: number;
		visitedNodes: number;
		generatedNodes: number;
		path: Move[];
	}

	export interface SafeBlock {
		safe: boolean;
		physical: boolean;
		liquid: boolean;
		height: number;
		block: Block | null;
	}

	export interface CoordinatesObject {
		x: number;
		y: number;
		z: number;
	}

	export interface DCoordinatesObject extends CoordinatesObject {
		dx: number;
		dy: number;
		dz: number;
		jump?: boolean;
	}
	
	export type DirectionCoordinates = Omit<CoordinatesObject, 'y'>;
}