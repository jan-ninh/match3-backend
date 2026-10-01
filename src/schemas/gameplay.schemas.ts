import { z } from 'zod';
const base = { operationId: z.uuid(), expectedRevision: z.number().int().nonnegative() };
export const startCommand = z.object({ ...base, stageNumber: z.number().int().min(1).max(12) }).strict();
export const terminalCommand = z
  .object({
    ...base,
    attemptId: z.uuid(),
    outcome: z.enum(['WIN', 'LOSS', 'ABANDON']),
    usage: z
      .array(z.object({ id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), power: z.enum(['bomb', 'laser', 'extraShuffle']) }).strict())
      .max(1024),
  })
  .strict();
export const rewardCommand = z.object({ ...base, attemptId: z.uuid(), power: z.enum(['bomb', 'laser', 'extraShuffle']) }).strict();
export const legacyAbandonCommand = z.object(base).strict();
export const idParam = z.object({ id: z.uuid() });
export type StartCommand = z.infer<typeof startCommand>;
export type TerminalCommand = z.infer<typeof terminalCommand>;
export type RewardCommand = z.infer<typeof rewardCommand>;
