// src/routes/game.routes.ts
import { Router } from 'express';
import { startStage, completeStage, loseGame, abandonGame, getStatus } from '#controllers';
import { validateBodyZod, validateParamsZod } from '#middlewares';
import { completeStageBodySchema, completeStageParamsSchema, gameEndParamsSchema } from '#schemas';

const router = Router();

router.post('/start/:id/:stageNumber', validateParamsZod(completeStageParamsSchema), startStage);
router.post('/completeStage/:id/:stageNumber', validateParamsZod(completeStageParamsSchema), validateBodyZod(completeStageBodySchema), completeStage);
router.post('/lose/:id', validateParamsZod(gameEndParamsSchema), loseGame);
router.post('/abandon/:id', validateParamsZod(gameEndParamsSchema), abandonGame);
// In your routes file (e.g., user.routes.ts)
router.get('/:id/status', validateParamsZod(gameEndParamsSchema), getStatus);
export default router;
