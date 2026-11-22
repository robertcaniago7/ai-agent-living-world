import * as THREE from 'three';
import { MATCH_SPOTS } from './layout';

/**
 * Football match — visual-only demo simulation (no LLM, no API calls).
 * Ball passes between match players, occasionally shoots at a goal;
 * goals update the score in the world store via syncMatchScore().
 * Field centre (-42, 10); goals at x -55.5 (west) and x -28.5 (east).
 */

export interface MatchPlayer {
  id: string;
  x: number;
  z: number;
  side: 'red' | 'blue';
}

export const matchState = {
  active: false,
  ball: new THREE.Vector3(-42, 0.22, 10),
  targetIdx: 0,
  passTimer: 0,
  shootTimer: 6,
  shooting: false,
  shootGoal: -55.5,
  shootZ: 10,
  scoreRed: 0,
  scoreBlue: 0,
  justScored: '' as '' | 'red' | 'blue',
};

export function startMatch(): void {
  matchState.active = true;
  matchState.ball.set(-42, 0.22, 10);
  matchState.targetIdx = 0;
  matchState.passTimer = 0;
  matchState.shootTimer = 6;
  matchState.shooting = false;
  matchState.scoreRed = 0;
  matchState.scoreBlue = 0;
  matchState.justScored = '';
}

export function stopMatch(): void {
  matchState.active = false;
  matchState.shooting = false;
  matchState.ball.set(-42, 0.22, 10);
}

/** Player spots on the field (from layout MATCH_SPOTS, side by index). */
export function matchSpotFor(index: number): { x: number; z: number; side: 'red' | 'blue' } {
  const s = MATCH_SPOTS[index % MATCH_SPOTS.length];
  return { x: s.x, z: s.z, side: index % 2 === 0 ? 'red' : 'blue' };
}

/** Advance the ball. `players` = current match-player positions. */
export function updateMatch(dt: number, players: MatchPlayer[]): void {
  if (!matchState.active || players.length === 0) return;
  const ball = matchState.ball;
  matchState.justScored = '';

  matchState.passTimer += dt;
  matchState.shootTimer -= dt;

  // start a shot every ~9s: aim at one goal (alternate sides by score parity)
  if (!matchState.shooting && matchState.shootTimer <= 0) {
    matchState.shooting = true;
    const attackRed = (matchState.scoreRed + matchState.scoreBlue) % 2 === 0;
    matchState.shootGoal = attackRed ? -55.5 : -28.5;
    // 75% on target (z near 10), else wide
    matchState.shootZ = Math.random() < 0.75 ? 10 + (Math.random() - 0.5) * 1.6 : 10 + (Math.random() < 0.5 ? -1 : 1) * (3 + Math.random() * 2);
    matchState.shootTimer = 9;
  }

  if (matchState.shooting) {
    const dx = matchState.shootGoal - ball.x;
    const dz = matchState.shootZ - ball.z;
    const dist = Math.hypot(dx, dz);
    const step = 15 * dt;
    if (dist <= step) {
      // reached the goal line
      if (Math.abs(ball.z - 10) < 1.7) {
        const scoredRed = matchState.shootGoal < -42;
        if (scoredRed) {
          matchState.scoreRed++;
          matchState.justScored = 'red';
        } else {
          matchState.scoreBlue++;
          matchState.justScored = 'blue';
        }
      }
      matchState.shooting = false;
      matchState.passTimer = 0;
      ball.set(-42, 0.22, 10);
      return;
    }
    ball.x += (dx / dist) * step;
    ball.z += (dz / dist) * step;
    return;
  }

  // passing: every ~2.4s pick another player
  if (matchState.passTimer > 2.4) {
    matchState.passTimer = 0;
    let next = Math.floor(Math.random() * players.length);
    if (players.length > 1 && next === matchState.targetIdx) next = (next + 1) % players.length;
    matchState.targetIdx = next;
  }
  const target = players[Math.min(matchState.targetIdx, players.length - 1)];
  const dx = target.x - ball.x;
  const dz = target.z - ball.z;
  const dist = Math.hypot(dx, dz);
  const step = 6.5 * dt;
  if (dist > step) {
    ball.x += (dx / dist) * step;
    ball.z += (dz / dist) * step;
  }
  ball.y = 0.22;
}
