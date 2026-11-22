/**
 * Budget check (Fase 7) — sebelum panggilan LLM (task maupun chat),
 * tolak bila estimasi biaya melebihi sisa budget bulanan agent
 * (kolom agent_configs.monthly_budget_usd, default $10).
 *
 * Estimasi bersifat kasar dan konservatif (dekomposisi + beberapa ronde
 * tool-call untuk task; konteks pendek + jawaban ≤ 1000 token untuk chat)
 * — bukan janji biaya akhir. Pemakaian nyata tetap dicatat per panggilan
 * di usage_records dan dijumlahkan di sini.
 */
import type { Db } from './db.js';
import { estimateCostUsd } from './llm/index.js';

export class BudgetExceededError extends Error {
  readonly code = 'BUDGET_EXCEEDED';
  constructor(agentId: string, budget: number, spent: number, estimate: number) {
    super(
      `BUDGET_EXCEEDED: budget bulanan agent ${agentId} terlampaui — budget $${budget.toFixed(2)}, ` +
        `sudah terpakai $${spent.toFixed(4)} bulan ini, estimasi panggilan ini $${estimate.toFixed(4)}.`,
    );
    this.name = 'BudgetExceededError';
  }
}

export function monthStartIso(): string {
  return `${new Date().toISOString().slice(0, 7)}-01T00:00:00.000Z`;
}

export async function getMonthlySpentUsd(db: Db, agentId: string): Promise<number> {
  const row = await db.get<{ total: number }>(
    'SELECT COALESCE(SUM(cost_usd), 0) as total FROM usage_records WHERE agent_id = ? AND at >= ?',
    [agentId, monthStartIso()],
  );
  return Number(row?.total ?? 0);
}

export async function getMonthlyBudgetUsd(db: Db, agentId: string): Promise<number> {
  const row = await db.get<{ monthly_budget_usd: number }>(
    'SELECT monthly_budget_usd FROM agent_configs WHERE agent_id = ?',
    [agentId],
  );
  return Number(row?.monthly_budget_usd ?? 10);
}

/** Estimasi kasar biaya satu task penuh (dekomposisi + ronde tool-call). */
export function estimateTaskCostUsd(model: string, maxTokensPerTask: number): number {
  return estimateCostUsd(model, 3000, Math.min(maxTokensPerTask, 4000) + 1000);
}

/** Estimasi kasar satu pesan chat (konteks pendek + jawaban ≤ 1000 token). */
export function estimateChatCostUsd(model: string): number {
  return estimateCostUsd(model, 2000, 1000);
}

/**
 * Lempar BudgetExceededError bila spent + estimasi > budget.
 * Dipakai orchestrator (task) dan route chat sebelum chatComplete.
 */
export async function checkBudget(
  db: Db,
  agentId: string,
  estimateUsd: number,
): Promise<{ budget: number; spent: number; estimate: number }> {
  const budget = await getMonthlyBudgetUsd(db, agentId);
  const spent = await getMonthlySpentUsd(db, agentId);
  if (spent + estimateUsd > budget) {
    throw new BudgetExceededError(agentId, budget, spent, estimateUsd);
  }
  return { budget, spent, estimate: estimateUsd };
}
