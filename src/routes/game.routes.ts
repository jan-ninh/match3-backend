import { Router } from 'express';
import { startStage, completeStage, loseGame, abandonGame, getStatus } from '#controllers';
import { validateBodyZod, validateParamsZod } from '#middlewares';
import { completeStageBodySchema } from '#schemas';
import { z } from 'zod';
import { authenticate, matchAccountParam } from '../middlewares/auth.middleware.ts';
const router = Router();
const stage = z.object({ stageNumber: z.coerce.number().int().min(1).max(12) });
const startBody = z.object({
  stageSelectedBoosters: z
    .object({
      bomb: z.number().int().nonnegative().optional(),
      laser: z.number().int().nonnegative().optional(),
      extraShuffle: z.number().int().nonnegative().optional(),
    })
    .optional(),
});
router.use(authenticate);
router.post('/start/:stageNumber', validateParamsZod(stage), validateBodyZod(startBody), startStage);
router.post('/completeStage/:stageNumber', validateParamsZod(stage), validateBodyZod(completeStageBodySchema), completeStage);
router.post('/lose', loseGame);
router.post('/abandon', abandonGame);
router.get('/status', getStatus);
// Historical clients may retain IDs; IDs cannot select an owner.
router.post('/start/:id/:stageNumber', matchAccountParam, validateParamsZod(stage), validateBodyZod(startBody), startStage);
router.post(
  '/completeStage/:id/:stageNumber',
  matchAccountParam,
  validateParamsZod(stage),
  validateBodyZod(completeStageBodySchema),
  completeStage,
);
router.post('/lose/:id', matchAccountParam, loseGame);
router.post('/abandon/:id', matchAccountParam, abandonGame);
router.get('/:id/status', matchAccountParam, getStatus);
export default router;
