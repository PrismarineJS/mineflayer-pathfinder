// Player-like locomotion over pathfinder routes. Rotation is sent only inside a mouse gesture, the body
// follows the string-pulled route by pure pursuit, and a walk ends by coasting, never by a snap to the
// block centre.
//
// Calibration targets (48 players recorded walking from a lobby spawn to a row of NPCs, 1.21.4):
//   head turn per 100 ms while moving: p25 8°, med 14°, p75 24°, p90 44°, p99 107°
//   head turn per 100 ms while still:  med 20°, p90 354° (snap turns)
//   first step -> sprint: 25% immediate, med 0.2 s
//   jumps per second of sprinting: p10 0.4, med 1.0, p90 1.6; pitch: med 10° down (p25 -1°, p75 22°)
//   motion heading vs head yaw: med 4°, 21% of samples > 25° (strafing / jump landings)
const { Vec3 } = require('vec3')
const Movements = require('./movements')
const goals = require('./goals')

const DEG = Math.PI / 180
const TICK = 0.05
// Yaw/pitch per mouse count at the default 50% sensitivity; every rotation sent is a multiple of it.
const SENS = 0.15 * DEG

// Mulberry32; a seed reproduces one personality and its noise.
function rng (seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function makePersonality (r, over) {
  const u = (lo, hi) => lo + (hi - lo) * r()
  const gauss = () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r())
  const p = {
    basePitch: Math.min(16, Math.max(-5, 6 + 5 * gauss())) * DEG, // radians, positive is looking down
    turnTime: u(0.75, 1.3), // scales how long one mouse gesture takes (1 = the measured median)
    sprints: r() < 0.8,
    sprintDelay: r() < 0.25 ? 0 : u(0.1, 0.8), // seconds between first step and sprint
    jumpRate: r() < 0.4 ? 0 : u(0.3, 1.1), // sprint-jumps per second, 0 = never
    lookAhead: u(1.8, 3.0), // pursuit distance in blocks
    stopRadius: u(0.25, 0.5), // release forward this far (plus coast distance) from the goal
    reaction: Math.max(0.08, 0.25 + 0.1 * gauss()), // seconds before acting on a new order
    glanceRate: r() < 0.35 ? 0 : 1 / u(5, 12), // sideways glances per second while walking, 0 = never
    strafe: r() < 0.5 ? 0 : u(0.2, 0.6), // probability of strafing rather than turning for a 20-60° correction
    deadband: u(4, 12) * DEG // radians of steering error tolerated while walking before the next gesture
  }
  return { ...p, ...over }
}

const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a))
const quantize = (a) => Math.round(a / SENS) * SENS
const yawTo = (from, to) => Math.atan2(-(to.x - from.x), -(to.z - from.z))
const horiz = (v) => Math.hypot(v.x, v.z)

function createHuman (bot, opts = {}) {
  const r = rng(opts.seed ?? (Date.now() ^ (Math.random() * 2 ** 31)))
  const personality = makePersonality(r, opts.personality ?? {})
  if (!bot.pathfinder) bot.loadPlugin(require('../index').pathfinder)

  // Head state, radians, mineflayer convention (yaw = atan2(-dx, -dz), pitch positive up).
  let yaw = bot.entity?.yaw ?? 0
  let pitch = bot.entity?.pitch ?? 0
  let targetYaw = null
  let targetPitch = null
  let pitchNoise = 0
  // A gesture is a fixed-duration minimum-jerk sweep from the head's start to the target's position at
  // gesture start. The head does not move outside a gesture.
  let gesture = null
  let glanceUntil = 0
  let glanceOffset = 0

  let walk = null
  let lastRotationDelta = 0
  let sprintReleaseUntil = 0
  let jumpHeld = 0
  let stuckJumpAt = 0
  let strafeUntil = 0
  let strafeDir = 'left'

  const human = { personality, route: [], walkTo, lookAt, stop, active: true }

  function movements () {
    if (opts.movements) return opts.movements
    const m = new Movements(bot)
    m.canDig = false
    m.allow1by1towers = false
    m.allowParkour = false
    m.allowSprinting = true
    m.scafoldingBlocks = []
    m.maxDropDown = 3
    return m
  }

  // Feet in the goal's block column, within a block of its level.
  class GoalBlock extends goals.Goal {
    constructor (x, y, z) {
      super()
      this.x = x
      this.y = y
      this.z = z
    }

    heuristic (node) {
      return Math.hypot(this.x - node.x, this.z - node.z) + Math.abs(this.y - node.y)
    }

    isEnd (node) {
      return node.x === this.x && node.z === this.z && Math.abs(node.y - this.y) <= 1
    }
  }

  // Each search slice holds the event loop for at most one tick's thinking. A search that ends without
  // reaching the goal yields the route to its closest node; the walk fails at that route's end.
  // Waypoints are block centres. A waypoint is dropped only when the segment skipping it is flat, floored
  // under every sample, and clear at feet and head across the body width.
  // `live` is polled between slices: a search whose walk is already gone stops instead of running out its
  // think timeout, so re-aiming at a moving target cannot pile up searches that all slice the event loop.
  async function planRoute (goal, live) {
    const goalNode = new GoalBlock(Math.floor(goal.x), Math.floor(goal.y), Math.floor(goal.z))
    const search = bot.pathfinder.getPathFromTo(movements(), bot.entity.position, goalNode, { timeout: opts.thinkTimeout ?? bot.pathfinder.thinkTimeout })
    let res = null
    for (;;) {
      const step = search.next()
      if (step.value) res = step.value.result
      if (step.done || res.status !== 'partial') break
      if (live && !live()) return null
      await new Promise(resolve => setImmediate(resolve))
    }
    // A search whose start already satisfies the goal succeeds with an empty path; that is 'already here'.
    if (res === null || (res.path.length === 0 && res.status !== 'success')) return null
    const complete = res.status === 'success'
    const start = bot.entity.position.clone()
    const pts = [start]
    for (const m of res.path) {
      const p = new Vec3(Math.floor(m.x) + 0.5, m.y, Math.floor(m.z) + 0.5)
      if (p.y === start.y && horiz(p.minus(start)) < 0.8) continue
      pts.push(p)
    }
    if (complete) pts.push(goal.clone())
    const out = [pts[0]]
    let i = 0
    while (i < pts.length - 1) {
      let j = pts.length - 1
      while (j > i + 1 && !straightWalkable(pts[i], pts[j])) j--
      out.push(pts[j])
      i = j
    }
    return { route: out, complete }
  }

  function solid (p) {
    const b = bot.blockAt(p)
    return b != null && b.boundingBox === 'block'
  }

  function passable (p) {
    const b = bot.blockAt(p)
    return b != null && b.boundingBox === 'empty'
  }

  function straightWalkable (a, b) {
    if (a.y !== b.y) return false
    const d = b.minus(a)
    const len = horiz(d)
    if (len === 0) return true
    const nx = -d.z / len
    const nz = d.x / len
    const steps = Math.ceil(len / 0.25)
    for (let s = 0; s <= steps; s++) {
      const t = s / steps
      for (const w of [-0.3, 0, 0.3]) {
        const p = new Vec3(a.x + d.x * t + nx * w, a.y, a.z + d.z * t + nz * w)
        if (!solid(p.offset(0, -1, 0)) || !passable(p) || !passable(p.offset(0, 1, 0))) return false
      }
    }
    return true
  }

  // Point on the route `lookAhead` blocks past the bot's projection onto it.
  function carrot (w, pos) {
    let remaining = personality.lookAhead
    let from = pos
    for (let k = w.idx; k < w.route.length; k++) {
      const to = w.route[k]
      const seg = to.minus(from)
      const len = horiz(seg)
      if (len >= remaining) {
        const t = remaining / len
        return new Vec3(from.x + seg.x * t, to.y, from.z + seg.z * t)
      }
      remaining -= len
      from = to
    }
    return w.route[w.route.length - 1]
  }

  function remainingDistance (w, pos) {
    let d = 0
    let from = pos
    for (let k = w.idx; k < w.route.length; k++) {
      d += horiz(w.route[k].minus(from))
      from = w.route[k]
    }
    return d
  }

  function walkDistance (w) {
    return horiz(w.route[w.route.length - 1].minus(bot.entity.position))
  }

  // No rotation is sent while there is no target.
  function stepHead (moving) {
    const ty = targetYaw === null ? yaw : targetYaw + (Date.now() < glanceUntil ? glanceOffset : 0)
    const tp = targetPitch === null ? pitch : targetPitch + pitchNoise
    if (gesture === null) {
      const yawErr = wrapAngle(ty - yaw)
      const pitchErr = tp - pitch
      // A look order and the final approach tolerate 0.2°; steering while walking tolerates `deadband`.
      const tol = walk !== null && targetYaw !== null && !(walk.faceAt && walkDistance(walk) < 2.5) ? personality.deadband : 0.2 * DEG
      if (Math.abs(yawErr) < tol && Math.abs(pitchErr) < Math.max(tol, 0.2 * DEG)) {
        lastRotationDelta = 0
        return
      }
      const amp = Math.max(Math.abs(yawErr), Math.abs(pitchErr))
      // Duration grows with the square root of the amplitude; a standing turn takes 0.6x a walking one.
      const secs = (0.08 + 0.3 * Math.sqrt(amp / (90 * DEG))) * (moving ? 1 : 0.6) * personality.turnTime
      // A gesture lands up to 6% of its yaw off the mark.
      const bias = (r() - 0.5) * 0.12 * yawErr
      gesture = { ticks: 0, total: Math.max(2, Math.round(secs / TICK)), y0: yaw, p0: pitch, ay: yawErr - bias, ap: pitchErr }
    }
    const g = gesture
    g.ticks++
    const t = Math.min(1, g.ticks / g.total)
    const frac = t * t * t * (10 - 15 * t + 6 * t * t)
    yaw = g.y0 + g.ay * frac
    pitch = Math.max(-89 * DEG, Math.min(89 * DEG, g.p0 + g.ap * frac))
    if (t >= 1) {
      gesture = null
      yaw = wrapAngle(yaw)
    }
    // Ornstein-Uhlenbeck pitch noise applies only while walking.
    if (walk) pitchNoise += (-pitchNoise / 2.5) * TICK + 2 * DEG * Math.sqrt(TICK) * (r() * 2 - 1) * 1.7
    // Jitter applies only during a gesture and stays below one mouse count most ticks.
    const jitter = gesture !== null ? 0.08 * DEG : 0
    const qy = quantize(yaw + (r() - 0.5) * jitter)
    const qp = quantize(pitch + (r() - 0.5) * jitter)
    lastRotationDelta = Math.abs(wrapAngle(qy - bot.entity.yaw)) + Math.abs(qp - bot.entity.pitch)
    if (qy !== bot.entity.yaw || qp !== bot.entity.pitch) bot.look(qy, qp, true)
  }

  function tick () {
    if (!human.active || !bot.entity?.position) return
    const now = Date.now()
    const pos = bot.entity.position
    const speed = horiz(bot.entity.velocity)
    const moving = speed > 0.03

    if (walk) tickWalk(walk, now, pos, speed)
    stepHead(moving)
    if (jumpHeld > 0 && --jumpHeld === 0) bot.setControlState('jump', false)
  }

  function tickWalk (w, now, pos, speed) {
    if (now - w.startedAt < personality.reaction * 1000) return
    // A waypoint is passed within 0.6 blocks, or within 1.2 blocks once the bot is beyond it along the next segment.
    while (w.idx < w.route.length - 1) {
      const wp = w.route[w.idx]
      const next = w.route[w.idx + 1]
      const passed = horiz(wp.minus(pos)) < 0.6 ||
        (wp.y === pos.y && next.minus(wp).dot(pos.minus(wp)) > 0 && horiz(wp.minus(pos)) < 1.2)
      if (!passed) break
      w.idx++
    }
    const last = w.route[w.route.length - 1]
    const goalDist = horiz(last.minus(pos))
    const remaining = remainingDistance(w, pos)
    if (goalDist < w.bestDist - 0.05) {
      w.bestDist = goalDist
      w.lastProgressAt = now
    }

    // Coast distance: ground friction leaves 0.546 of the horizontal velocity each tick.
    const coast = speed * 0.546 / (1 - 0.546)
    const arrived = goalDist <= w.radius + coast && w.idx >= w.route.length - 1
    if (arrived) {
      bot.setControlState('forward', false)
      bot.setControlState('left', false)
      bot.setControlState('right', false)
      bot.setControlState('sprint', false)
      if (speed < 0.02) {
        if (w.complete || horiz(w.goal.minus(pos)) <= w.radius + 1) finishWalk(w)
        else failWalk(w, new Error(`no path to ${w.goal}`))
      }
      return
    }

    const target = carrot(w, pos)
    const wantYaw = yawTo(pos, target)
    targetYaw = wantYaw
    targetPitch = -personality.basePitch
    if (personality.glanceRate > 0 && now > glanceUntil && r() < personality.glanceRate * TICK && remaining > 6) {
      glanceOffset = (r() < 0.5 ? -1 : 1) * (15 + 25 * r()) * DEG
      glanceUntil = now + 400 + 500 * r()
    }

    const err = wrapAngle(wantYaw - yaw)
    const aerr = Math.abs(err)
    // Forward is held only while the heading error is under 50° (75° while moving).
    const canWalk = aerr < (speed > 0.1 ? 75 : 50) * DEG
    let left = false
    let right = false
    if (canWalk && aerr > 20 * DEG && personality.strafe > 0 && r() < personality.strafe * TICK * 4) {
      // A strafe holds for 250-550 ms through strafeUntil.
      strafeUntil = now + 250 + 300 * r()
      strafeDir = err > 0 ? 'left' : 'right'
    }
    if (now < strafeUntil && canWalk) {
      if (strafeDir === 'left') left = true
      else right = true
    }
    bot.setControlState('forward', canWalk)
    bot.setControlState('left', left)
    bot.setControlState('right', right)
    if (canWalk && w.firstStepAt === 0) {
      w.firstStepAt = now
      w.sprintAt = now + personality.sprintDelay * 1000
    }

    const nextUp = w.idx < w.route.length && w.route[w.idx].y > pos.y + 0.5 && horiz(w.route[w.idx].minus(pos)) < 1.1
    const flatAhead = w.idx < w.route.length && w.route[w.idx].y <= pos.y + 0.5 && horiz(w.route[w.idx].minus(pos)) > 1.5
    const wantSprint = personality.sprints && canWalk && now >= w.sprintAt && remaining > 2.5 && aerr < 40 * DEG && now > sprintReleaseUntil
    bot.setControlState('sprint', wantSprint)

    if (bot.entity.onGround && jumpHeld === 0) {
      if (nextUp) jump()
      else if (wantSprint && personality.jumpRate > 0 && flatAhead && remaining > 4 && headroom(pos) && r() < personality.jumpRate * TICK / 0.55) jump()
    }

    // No progress for 1.5 s hops; 4 s re-plans, one in flight at a time; more than three re-plans fails the walk.
    if (now - w.lastProgressAt > 1500 && now - stuckJumpAt > 1200 && bot.entity.onGround) {
      stuckJumpAt = now
      jump()
    }
    if (now - w.lastProgressAt > 4000 && !w.replanning) {
      if (++w.replans > 3) {
        failWalk(w, new Error('stuck'))
        return
      }
      w.replanning = true
      planRoute(w.goal, () => walk === w).then(plan => {
        w.replanning = false
        if (walk !== w) return
        if (!plan) {
          failWalk(w, new Error('no path on re-plan'))
          return
        }
        w.route = plan.route
        w.complete = plan.complete
        w.idx = 0
        w.lastProgressAt = Date.now()
        w.bestDist = Infinity
        human.route = plan.route
        sprintReleaseUntil = Date.now() + 600
      })
    }
  }

  function headroom (pos) {
    for (let dy = 2; dy <= 3; dy++) if (!passable(pos.offset(0, dy, 0))) return false
    return true
  }

  function jump () {
    bot.setControlState('jump', true)
    jumpHeld = 1
  }

  function pitchTo (from, to) {
    const eye = from.offset(0, bot.entity.eyeHeight ?? 1.62, 0)
    const d = to.minus(eye)
    return Math.atan2(d.y, horiz(d))
  }

  function releaseControls () {
    for (const c of ['forward', 'back', 'left', 'right', 'sprint', 'jump']) bot.setControlState(c, false)
  }

  function finishWalk (w) {
    if (walk !== w) return
    clearTimeout(w.timer)
    walk = null
    releaseControls()
    if (w.faceAt) {
      targetYaw = yawTo(bot.entity.position, w.faceAt)
      targetPitch = pitchTo(bot.entity.position, w.faceAt)
      settled(400).then(releaseHead, releaseHead).then(w.resolve, w.resolve)
    } else {
      releaseHead()
      w.resolve()
    }
  }

  function failWalk (w, e) {
    if (walk !== w) return
    clearTimeout(w.timer)
    walk = null
    releaseControls()
    releaseHead()
    w.reject(e)
  }

  // Resolves once the head has stopped moving for `ms`.
  function settled (ms) {
    return new Promise(resolve => {
      let quietSince = Date.now()
      const check = () => {
        if (lastRotationDelta > 0.02 * DEG) quietSince = Date.now()
        if (Date.now() - quietSince >= ms) {
          bot.off('physicsTick', check)
          resolve()
        }
      }
      bot.on('physicsTick', check)
    })
  }

  let planSeq = 0
  // The walkTo in flight, from the call until its promise settles: planning included, so a goal
  // reissued while the search is still slicing joins it too.
  let inflight = null

  // A walkTo for the goal already in flight (within half a block) returns that walk's promise; any
  // other goal supersedes it. Re-targeting on a timer would otherwise fail every walk before it
  // took a step.
  function walkTo (goal, o = {}) {
    if (inflight && inflight.goal.distanceTo(goal) <= 0.5) return inflight.promise
    const promise = startWalk(goal, o)
    const mine = { goal: goal.clone(), promise }
    inflight = mine
    const clear = () => { if (inflight === mine) inflight = null }
    promise.then(clear, clear)
    return promise
  }

  async function startWalk (goal, o) {
    if (walk) failWalk(walk, new Error('superseded'))
    const seq = ++planSeq
    const plan = await planRoute(goal, () => seq === planSeq)
    if (seq !== planSeq) throw new Error('superseded')
    if (!plan) throw new Error(`no path to ${goal}`)
    const { route, complete } = plan
    return new Promise((resolve, reject) => {
      const now = Date.now()
      const w = {
        goal: goal.clone(),
        route, // waypoints, y = feet level
        idx: 0, // next waypoint
        complete, // the route ends at the goal rather than at the closest reachable point
        replanning: false,
        radius: o.radius ?? personality.stopRadius,
        startedAt: now,
        firstStepAt: 0,
        lastProgressAt: now + personality.reaction * 1000,
        bestDist: Infinity,
        sprintAt: Infinity,
        faceAt: o.faceAt,
        replans: 0,
        resolve,
        reject,
        timer: setTimeout(() => failWalk(w, new Error('walk timed out')), o.timeout ?? 60000)
      }
      walk = w
      human.route = route
    })
  }

  async function lookAt (point, o = {}) {
    await new Promise(resolve => setTimeout(resolve, personality.reaction * 1000 * (0.5 + r())))
    targetYaw = yawTo(bot.entity.position, point)
    targetPitch = pitchTo(bot.entity.position, point)
    await settled(o.settleMs ?? 300)
    releaseHead()
  }

  // The head holds a target only while it is being aimed: once it has arrived, a rotation the
  // server forces stands instead of being pulled back.
  function releaseHead () {
    targetYaw = null
    targetPitch = null
  }

  function stop () {
    if (walk) failWalk(walk, new Error('stopped'))
    releaseHead()
  }

  bot.on('physicsTick', tick)
  // A server teleport sets the head to the entity's rotation and cancels the gesture.
  bot.on('forcedMove', () => {
    yaw = bot.entity.yaw
    pitch = bot.entity.pitch
    gesture = null
  })
  return human
}

module.exports = { createHuman }
