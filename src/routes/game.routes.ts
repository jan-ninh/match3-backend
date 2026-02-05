// src/routes/game.routes.ts
import { Router } from 'express';
import { completeStage } from '../controllers/game.controller.ts';
import { validateBodyZod, validateParamsZod } from '../middlewares/validateZod.ts';
import { completeStageBodySchema, completeStageParamsSchema } from '../schemas/game.schemas.ts';

const router = Router();

router.post('/completeStage/:id/:stageNumber', validateParamsZod(completeStageParamsSchema), validateBodyZod(completeStageBodySchema), completeStage);

export default router;
