/* eslint-env mocha */
const assert = require('assert')
const { EventEmitter } = require('events')
const { pathfinder } = require('..')

describe('bestHarvestTool enchantments', () => {
  it('uses the item enchantment API for tools without legacy NBT', () => {
    const bot = new EventEmitter()
    bot.registry = require('minecraft-data')('1.21.4')
    bot.entity = { effects: {} }
    const type = bot.registry.itemsByName.diamond_pickaxe.id
    const ordinary = { type, enchants: [] }
    const efficient = { type, enchants: [{ name: 'efficiency', lvl: 5 }] }
    bot.inventory = { items: () => [ordinary, efficient] }
    pathfinder(bot)
    const Block = require('prismarine-block')('1.21.4')
    const stone = Block.fromStateId(bot.registry.blocksByName.stone.defaultState, 0)
    assert.strictEqual(bot.pathfinder.bestHarvestTool(stone), efficient)
  })
})
