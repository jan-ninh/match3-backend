import { Router } from 'express';
import { authenticate, matchAccountParam } from '../middlewares/auth.middleware.ts';
import { validateBodyZod, validateParamsZod } from '#middlewares';
import { startCommand, terminalCommand, rewardCommand, legacyAbandonCommand, idParam } from '../schemas/gameplay.schemas.ts';
import {
  startAttempt,
  finishAttempt,
  claimReward,
  abandonLegacy,
  getGameplaySnapshot,
  getOperation,
  getAttempt,
  deprecatedGameplay,
} from '../controllers/gameplay.controller.ts';
const router = Router();
router.use(authenticate);
router.get('/snapshot', getGameplaySnapshot);
router.get('/status', getGameplaySnapshot);
router.post('/attempts/start', validateBodyZod(startCommand), startAttempt);
router.post('/attempts/terminal', validateBodyZod(terminalCommand), finishAttempt);
router.post('/rewards/claim', validateBodyZod(rewardCommand), claimReward);
router.post('/legacy-abandon', validateBodyZod(legacyAbandonCommand), abandonLegacy);
router.get('/operations/:id', validateParamsZod(idParam), getOperation);
router.get('/attempts/:id', validateParamsZod(idParam), getAttempt);
// Preserve historical paths as explicit deprecations; none can bypass the transition service.
router.post('/start/:stageNumber', deprecatedGameplay);
router.post('/completeStage/:stageNumber', deprecatedGameplay);
router.post('/lose', deprecatedGameplay);
router.post('/abandon', deprecatedGameplay);
router.post('/start/:id/:stageNumber', matchAccountParam, deprecatedGameplay);
router.post('/completeStage/:id/:stageNumber', matchAccountParam, deprecatedGameplay);
router.post('/lose/:id', matchAccountParam, deprecatedGameplay);
router.post('/abandon/:id', matchAccountParam, deprecatedGameplay);
router.get('/:id/status', matchAccountParam, getGameplaySnapshot);
export default router;
