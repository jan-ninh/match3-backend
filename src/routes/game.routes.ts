// src/routes/game.routes.ts
import { Router } from 'express';
import { startStage, completeStage, loseGame, abandonGame, getStatus } from '#controllers';
import { validateBodyZod, validateParamsZod } from '#middlewares';
import { completeStageBodySchema, completeStageParamsSchema } from '#schemas';

const router = Router();

router.post('/start/:id/:stageNumber', validateParamsZod(completeStageParamsSchema), startStage);
router.post('/completeStage/:id/:stageNumber', validateParamsZod(completeStageParamsSchema), validateBodyZod(completeStageBodySchema), completeStage);
router.post('/lose/:id', loseGame);
router.post('/abandon/:id', abandonGame);
// In your routes file (e.g., user.routes.ts)
router.get('/:id/status', getStatus);
export default router;
