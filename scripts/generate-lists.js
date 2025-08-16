#!/usr/bin/env node

// Generator script to build exhaustive interactable/passable lists
// Generates a union across multiple Minecraft versions

const fs = require('fs')
const path = require('path')
const mcData = require('minecraft-data')

// Versions to scan (add more as needed)
const VERSIONS = ['1.16.5', '1.17.1', '1.18.2', '1.19.4', '1.20.4', '1.21', '1.21.4']

const WOOD_TYPES = ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak', 'mangrove', 'cherry', 'bamboo', 'crimson', 'warped', 'pale_oak']
const COLORS = ['white', 'light_gray', 'gray', 'black', 'brown', 'red', 'orange', 'yellow', 'lime', 'green', 'cyan', 'light_blue', 'blue', 'purple', 'magenta', 'pink']

const STATIC_INTERACTABLES = [
  'chest', 'trapped_chest', 'ender_chest', 'barrel', 'hopper', 'shulker_box',
  'crafting_table', 'furnace', 'blast_furnace', 'smoker', 'brewing_stand',
  'anvil', 'chipped_anvil', 'damaged_anvil', 'smithing_table', 'stonecutter',
  'grindstone', 'cartography_table', 'loom', 'composter', 'enchanting_table',
  'enchantment_table', 'fletching_table', 'lectern',
  'jukebox', 'beacon', 'bell', 'cauldron', 'flower_pot', 'note_block',
  'daylight_detector', 'daylight_detector_inverted', 'dragon_egg',
  'campfire', 'soul_campfire', 'respawn_anchor', 'lodestone',
  'lever', 'repeater', 'powered_repeater', 'unpowered_repeater',
  'comparator', 'redstone_comparator_off', 'redstone_comparator_on',
  'command_block', 'chain_command_block', 'repeating_command_block',
  'crafter', 'chiseled_bookshelf', 'decorated_pot', 'trial_spawner',
  'bed_block', 'door', 'trap_door', 'diode', 'diode_block_off', 'diode_block_on', 'command',
  'iron_door', 'iron_trapdoor', 'stone_button', 'polished_blackstone_button'
]

const PASSABLE_ENTITIES = [
  'falling_block', 'tnt', 'primed_tnt',
  'item', 'item_frame', 'glow_item_frame', 'leash_knot', 'painting',
  'armor_stand', 'marker',
  'arrow', 'spectral_arrow', 'trident', 'egg', 'snowball', 'ender_pearl',
  'eye_of_ender', 'potion', 'experience_bottle', 'fishing_bobber',
  'dragon_fireball', 'fireball', 'small_fireball', 'wither_skull',
  'shulker_bullet', 'llama_spit', 'evoker_fangs',
  'area_effect_cloud', 'end_crystal', 'firework_rocket', 'lightning_bolt',
  'experience_orb', 'xp_orb',
  'block_display', 'item_display', 'text_display', 'interaction',
  'wind_charge', 'breeze_wind_charge'
]

function getInteractablesForVersion(version) {
  const data = mcData(version)
  const blockExists = (name) => !!data.blocksByName[name]
  const itemExists = (name) => !!data.itemsByName[name]
  const set = new Set()

  // Wood variants - blocks
  for (const wood of WOOD_TYPES) {
    for (const suffix of ['door', 'trapdoor', 'fence_gate', 'button', 'sign', 'wall_sign', 'hanging_sign', 'wall_hanging_sign']) {
      const name = `${wood}_${suffix}`
      if (blockExists(name)) set.add(name)
    }
    
    // Boats and chest boats (items, but included in interactables for consistency)
    // Skip nether woods which don't have boats
    if (!['crimson', 'warped'].includes(wood)) {
      if (wood === 'bamboo') {
        // Bamboo uses raft instead of boat
        if (itemExists('bamboo_raft')) set.add('bamboo_raft')
        if (itemExists('bamboo_chest_raft')) set.add('bamboo_chest_raft')
      } else {
        if (itemExists(`${wood}_boat`)) set.add(`${wood}_boat`)
        if (itemExists(`${wood}_chest_boat`)) set.add(`${wood}_chest_boat`)
      }
    }
  }

  // Colored variants
  for (const color of COLORS) {
    if (blockExists(`${color}_bed`)) set.add(`${color}_bed`)
    if (blockExists(`${color}_shulker_box`)) set.add(`${color}_shulker_box`)
  }

  // Static blocks
  for (const name of STATIC_INTERACTABLES) {
    if (blockExists(name)) set.add(name)
  }

  // Find all doors/trapdoors/gates/buttons in registry
  Object.keys(data.blocksByName).forEach(name => {
    if (name.includes('_door') || name.includes('trapdoor') || name.includes('_gate') || name.includes('_button')) {
      set.add(name)
    }
  })

  return set
}

function getPassableEntitiesForVersion(version) {
  const data = mcData(version)
  const exists = (name) => !!data.entitiesByName[name]
  return new Set(PASSABLE_ENTITIES.filter(exists))
}

function unionSets(sets) {
  const result = new Set()
  for (const set of sets) {
    for (const item of set) {
      result.add(item)
    }
  }
  return result
}

console.log('Generating lists from Minecraft versions:', VERSIONS.join(', '))

// Generate interactables
const allInteractables = []
for (const version of VERSIONS) {
  try {
    const versionSet = getInteractablesForVersion(version)
    allInteractables.push(versionSet)
    console.log(`  ${version}: Found ${versionSet.size} interactable blocks`)
  } catch (e) {
    console.warn(`  ${version}: Failed to load (${e.message})`)
  }
}

const interactablesUnion = unionSets(allInteractables)
const interactablesList = Array.from(interactablesUnion).sort()

// Generate passables
const allPassables = []
for (const version of VERSIONS) {
  try {
    const versionSet = getPassableEntitiesForVersion(version)
    allPassables.push(versionSet)
    console.log(`  ${version}: Found ${versionSet.size} passable entities`)
  } catch (e) {
    console.warn(`  ${version}: Failed to load (${e.message})`)
  }
}

const passablesUnion = unionSets(allPassables)
const passablesList = Array.from(passablesUnion).sort()

// Write files
const libDir = path.join(__dirname, '..', 'lib')
fs.writeFileSync(
  path.join(libDir, 'interactable.json'),
  JSON.stringify(interactablesList, null, 2) + '\n'
)
fs.writeFileSync(
  path.join(libDir, 'passableEntities.json'),
  JSON.stringify(passablesList, null, 2) + '\n'
)

console.log(`\nWrote ${interactablesList.length} blocks to lib/interactable.json`)
console.log(`Wrote ${passablesList.length} entities to lib/passableEntities.json`)
console.log('\nDone! The lists have been regenerated.')