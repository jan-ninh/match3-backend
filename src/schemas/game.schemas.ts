// src/schemas/game.schemas.ts
import { z } from 'zod';

export const completeStageBodySchema = z.object({
  usedPower: z.enum(['bomb', 'rocket', 'extraTime']).optional(),
});

export const completeStageParamsSchema = z.object({
  id: z.string().min(24).max(24), // MongoDB ObjectId
  stageNumber: z.string().transform(Number).pipe(z.number().int().min(1).max(12)),
});
