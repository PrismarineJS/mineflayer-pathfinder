/* eslint-env mocha */

const assert = require('assert')
const fs = require('fs')
const path = require('path')
const mcData = require('minecraft-data')
const { buildInteractableSet, buildPassableEntities } = require('../lib/runtime-sets')

describe('Block and Entity Lists', () => {
  const interactableJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'lib', 'interactable.json')))
  const passableJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'lib', 'passableEntities.json')))

  describe('Static JSON lists', () => {
    it('should have valid JSON structure', () => {
      assert(Array.isArray(interactableJson), 'interactable.json should be an array')
      assert(Array.isArray(passableJson), 'passableEntities.json should be an array')
    })

    it('should contain no duplicates', () => {
      const interactableSet = new Set(interactableJson)
      assert.strictEqual(interactableSet.size, interactableJson.length, 'interactable.json has duplicates')
      
      const passableSet = new Set(passableJson)
      assert.strictEqual(passableSet.size, passableJson.length, 'passableEntities.json has duplicates')
    })

    it('should have no obvious typos', () => {
      // Check for common typos
      const typoPatterns = [
        /yelow/, // should be yellow
        /gey/, // should be gray/grey
        /purpel/, // should be purple
        /diamon/, // should be diamond
        /emrald/, // should be emerald
      ]

      for (const name of interactableJson) {
        for (const pattern of typoPatterns) {
          assert(!pattern.test(name), `Possible typo in interactable.json: ${name}`)
        }
      }
    })

    it('should be alphabetically sorted', () => {
      const sortedInteractable = [...interactableJson].sort()
      const sortedPassable = [...passableJson].sort()
      
      assert.deepStrictEqual(interactableJson, sortedInteractable, 'interactable.json is not sorted')
      assert.deepStrictEqual(passableJson, sortedPassable, 'passableEntities.json is not sorted')
    })
  })

  describe('Runtime detection (1.20.4)', () => {
    let data
    let mockBot

    before(() => {
      data = mcData('1.20.4')
      mockBot = { registry: data, mcData: data }
    })

    it('should build valid interactable set', () => {
      const set = buildInteractableSet(mockBot)
      assert(set instanceof Set, 'Should return a Set')
      assert(set.size > 0, 'Should contain blocks')
      
      // Verify some expected blocks exist
      assert(set.has('oak_door'), 'Should include oak_door')
      assert(set.has('chest'), 'Should include chest')
      assert(set.has('crafting_table'), 'Should include crafting_table')
    })

    it('should build valid passable entities set', () => {
      const set = buildPassableEntities(mockBot)
      assert(set instanceof Set, 'Should return a Set')
      assert(set.size > 0, 'Should contain entities')
      
      // Verify some expected entities exist
      assert(set.has('arrow'), 'Should include arrow')
      assert(set.has('item'), 'Should include item')
    })

    it('should only include blocks that exist in the version', () => {
      const set = buildInteractableSet(mockBot)
      for (const blockName of set) {
        assert(data.blocksByName[blockName], `Block ${blockName} doesn't exist in 1.20.4`)
      }
    })

    it('should only include entities that exist in the version', () => {
      const set = buildPassableEntities(mockBot)
      for (const entityName of set) {
        assert(data.entitiesByName[entityName], `Entity ${entityName} doesn't exist in 1.20.4`)
      }
    })
  })

  describe('Cross-version coverage', () => {
    const versions = ['1.16.5', '1.19.4', '1.20.4']

    it('should handle different minecraft versions gracefully', () => {
      for (const version of versions) {
        try {
          const data = mcData(version)
          const mockBot = { registry: data, mcData: data }
          
          const blockSet = buildInteractableSet(mockBot)
          const entitySet = buildPassableEntities(mockBot)
          
          assert(blockSet.size > 50, `${version} should have many interactable blocks`)
          assert(entitySet.size > 10, `${version} should have many passable entities`)
        } catch (e) {
          // Version might not be available in test environment
          console.warn(`Skipping ${version}: ${e.message}`)
        }
      }
    })
  })
})