// Runtime version-aware block/entity detection
// Automatically adapts to any Minecraft version

const WOOD_TYPES = ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak', 'mangrove', 'cherry', 'bamboo', 'crimson', 'warped', 'pale_oak']
const COLORS = ['white', 'light_gray', 'gray', 'black', 'brown', 'red', 'orange', 'yellow', 'lime', 'green', 'cyan', 'light_blue', 'blue', 'purple', 'magenta', 'pink']

// Core interactable blocks (containers, workstations, redstone)
const STATIC_INTERACTABLES = [
  // Containers
  'chest', 'trapped_chest', 'ender_chest', 'barrel', 'hopper', 'shulker_box',
  // Workstations
  'crafting_table', 'furnace', 'blast_furnace', 'smoker', 'brewing_stand',
  'anvil', 'chipped_anvil', 'damaged_anvil', 'smithing_table', 'stonecutter',
  'grindstone', 'cartography_table', 'loom', 'composter', 'enchanting_table',
  'enchantment_table', 'fletching_table', 'lectern', 'stonecutter',
  // Interactive blocks
  'jukebox', 'beacon', 'bell', 'cauldron', 'flower_pot', 'note_block',
  'daylight_detector', 'daylight_detector_inverted', 'dragon_egg',
  'campfire', 'soul_campfire', 'respawn_anchor', 'lodestone',
  // Redstone components
  'lever', 'repeater', 'powered_repeater', 'unpowered_repeater',
  'comparator', 'redstone_comparator_off', 'redstone_comparator_on',
  'command_block', 'chain_command_block', 'repeating_command_block',
  // New in 1.19-1.21
  'crafter', 'chiseled_bookshelf', 'decorated_pot', 'trial_spawner',
  // Legacy names
  'bed_block', 'door', 'trap_door', 'diode', 'diode_block_off', 'diode_block_on', 'command'
]

// Passable entities (projectiles, displays, decorations)
const PASSABLE_ENTITIES = [
  // Blocks as entities
  'falling_block', 'tnt', 'primed_tnt',
  // Items & decorations
  'item', 'item_frame', 'glow_item_frame', 'leash_knot', 'painting',
  'armor_stand', 'marker',
  // Projectiles
  'arrow', 'spectral_arrow', 'trident', 'egg', 'snowball', 'ender_pearl',
  'eye_of_ender', 'potion', 'experience_bottle', 'fishing_bobber',
  // Fireballs & magic
  'dragon_fireball', 'fireball', 'small_fireball', 'wither_skull',
  'shulker_bullet', 'llama_spit', 'evoker_fangs',
  // Effects
  'area_effect_cloud', 'end_crystal', 'firework_rocket', 'lightning_bolt',
  'experience_orb', 'xp_orb',
  // 1.19+ display entities
  'block_display', 'item_display', 'text_display', 'interaction',
  // 1.21 wind charges
  'wind_charge', 'breeze_wind_charge'
]

/**
 * Build a set of interactable blocks for the current Minecraft version
 * @param {*} registry - The minecraft-data registry (bot.registry or bot.mcData)
 * @param {string[]} [fallbackJson] - Optional fallback JSON array to validate
 * @returns {Set<string>} Set of block names that are interactable
 */
function buildInteractableSet (registry, fallbackJson = []) {
  const blocksByName = registry.blocksByName
  const exists = (name) => !!blocksByName[name]
  const out = new Set()

  // Add wood variants (doors, trapdoors, gates, buttons, signs)
  for (const wood of WOOD_TYPES) {
    for (const suffix of ['door', 'trapdoor', 'fence_gate', 'button', 'sign', 'wall_sign', 'hanging_sign', 'wall_hanging_sign']) {
      const name = `${wood}_${suffix}`
      if (exists(name)) out.add(name)
    }
  }

  // Add colored beds and shulker boxes
  for (const color of COLORS) {
    if (exists(`${color}_bed`)) out.add(`${color}_bed`)
    if (exists(`${color}_shulker_box`)) out.add(`${color}_shulker_box`)
  }

  // Add all static interactables that exist in this version
  for (const name of STATIC_INTERACTABLES) {
    if (exists(name)) out.add(name)
  }

  // Add iron/stone variants
  for (const prefix of ['iron', 'stone', 'polished_blackstone']) {
    if (exists(`${prefix}_door`)) out.add(`${prefix}_door`)
    if (exists(`${prefix}_trapdoor`)) out.add(`${prefix}_trapdoor`)
    if (exists(`${prefix}_button`)) out.add(`${prefix}_button`)
  }

  // Add all trapdoors (some versions have copper/waxed variants)
  Object.keys(blocksByName).forEach(name => {
    if (name.includes('trapdoor') || name.includes('_door') || name.includes('_gate')) {
      out.add(name)
    }
  })

  // Validate and add fallback entries if they exist in registry
  if (Array.isArray(fallbackJson)) {
    for (const name of fallbackJson) {
      if (blocksByName[name]) out.add(name)
    }
  }

  return out
}

/**
 * Build a set of passable entities for the current Minecraft version
 * @param {import('mineflayer').Bot} bot - The mineflayer bot instance
 * @returns {Set<string>} Set of entity names that should be ignored for collision
 */
function buildPassableEntities (bot) {
  const registry = bot.registry || bot.mcData
  const entitiesByName = registry.entitiesByName
  const exists = (name) => !!entitiesByName[name]

  return new Set(PASSABLE_ENTITIES.filter(exists))
}

module.exports = {
  buildInteractableSet,
  buildPassableEntities
}
