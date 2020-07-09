/// <reference types="prismarine-entity" />

declare module 'mineflayer-pathfinder'
{
    export const goals;
    export class Movements
    {
        constructor(bot: Bot, mcData: any);
    }

    export class PathNode
    {
        data: PathNodeData;
        g: number;
        h: number;
        f: number;
        parent?: PathNode;

        set(data: PathNodeData, g: number, h: number, parent?): void;
    }

    export class PathNodeData
    {
        x: number;
        y: number;
        z: number;
        remainingBlocks: number;
    }

    export class Goal
    {
        heuristic(node: PathNodeData): number;
        isEnd(node: PathNodeData): boolean;
        hasChanged(): boolean;
    }

    export class GoalBlock extends Goal
    {
        constructor(x: number, y: number, z: number);
    }

    export class GoalNear extends Goal
    {
        constructor(x: number, y: number, z: number, range: number);
    }

    export class GoalXZ extends Goal
    {
        constructor(x: number, z: number);
    }

    export class GoalY extends Goal
    {
        constructor(y: number);
    }

    export class GoalGetToBlock extends Goal
    {
        constructor(x: number, y: number, z: number);
    }

    export class GoalCompositeAny extends Goal
    {
        constructor();
        push(goal: Goal): void;
    }

    export class GoalCompositeAll extends Goal
    {
        constructor();
        push(goal: Goal): void;
    }

    export class GoalInvert extends Goal
    {
        constructor(goal: Goal);
    }

    export class GoalFollow extends Goal
    {
        constructor(entity: Entity, range: number);
    }

    export class Result
    {
        status: string;
        cost: number;
        time: number;
        visitedNodes: number;
        generatedNodes: number;
        path: PathNodeData[];
    }
}
