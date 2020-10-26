/// <reference types="prismarine-entity" />

import { Entity } from "prismarine-entity";
import { Bot } from "mineflayer";
import { Item } from "prismarine-item";
import { Block } from "prismarine-block";

declare module 'mineflayer-pathfinder'
{

    export function pathfinder(bot: Bot): void;
    export namespace goals
    {
        export class Goal
        {
            constructor();

            heuristic(node: Move): number;
            isEnd(node: Move): boolean;
            hasChanged(): boolean;
        }

        export class GoalBlock extends Goal
        {
            x: number;
            y: number;
            z: number;

            constructor(x: number, y: number, z: number);
        }

        export class GoalNear extends Goal
        {
            x: number;
            y: number;
            z: number;
            range: number;

            constructor(x: number, y: number, z: number, range: number);
        }

        export class GoalXZ extends Goal
        {
            x: number;
            z: number;

            constructor(x: number, z: number);
        }

        export class GoalY extends Goal
        {
            y: number;

            constructor(y: number);
        }

        export class GoalGetToBlock extends Goal
        {
            x: number;
            y: number;
            z: number;

            constructor(x: number, y: number, z: number);
        }

        export class GoalCompositeAny extends Goal
        {
            goals: Goal[];

            constructor();

            push(goal: Goal): void;
        }

        export class GoalCompositeAll extends Goal
        {
            goals: Goal[];

            constructor();

            push(goal: Goal): void;
        }

        export class GoalInvert extends Goal
        {
            goal: Goal;

            constructor(goal: Goal);
        }

        export class GoalFollow extends Goal
        {
            entity: Entity;
            range: number;

            constructor(entity: Entity, range: number);
        }
    }

    export class Movements
    {
        constructor(bot: Bot, mcData: any);
    }

    export class PathNode
    {
        data: Move;
        g: number;
        h: number;
        f: number;
        parent?: PathNode;

        set(data: Move, g: number, h: number, parent?: PathNode): void;
    }

    export interface MoveBlockChange
    {
        x: number;
        y: number;
        z: number;
        dx?: number;
        dy?: number;
        dz?: number;
    }

    export class Move
    {
        x: number;
        y: number;
        z: number;
        remainingBlocks?: number;
        cost?: number;
        toBreak?: MoveBlockChange[];
        toPlace?: MoveBlockChange[];
        parkour?: boolean;
        hash?: string;
    }

    export class Result
    {
        status: string;
        cost: number;
        time: number;
        visitedNodes: number;
        generatedNodes: number;
        path: Move[];
    }

    export class Pathfinder
    {
        bestHarvestTool(block: Block): Item | null;
        getPathTo(movements: Movements, goal: goals.Goal, done: (result: Result) => void, timeout: number): void;
        setGoal(goal: goals.Goal, dynamic?: boolean): void;
        setMovements(movements: Movements): void;
        isMoving(): boolean;
        isMining(): boolean;
        isBuilding(): boolean;
        isThinking(): boolean;
    }
}
