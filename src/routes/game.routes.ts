// src/routes/game.routes.ts
import { Router } from 'express';
import { startStage, completeStage, loseGame, abandonGame } from '../controllers/game.controller.ts';
import { validateBodyZod, validateParamsZod } from '../middlewares/validateZod.ts';
import { completeStageBodySchema, completeStageParamsSchema } from '../schemas/game.schemas.ts';

const router = Router();

router.post('/start/:id/:stageNumber', validateParamsZod(completeStageParamsSchema), startStage);
router.post('/completeStage/:id/:stageNumber', validateParamsZod(completeStageParamsSchema), validateBodyZod(completeStageBodySchema), completeStage);
router.post('/lose/:id', loseGame);
router.post('/abandon/:id', abandonGame);

export default router;
