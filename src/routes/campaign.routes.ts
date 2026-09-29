import { authenticate } from '../middlewares/auth.middleware.ts';
// src/routes/campaign.routes.ts
import { Router } from 'express';
import { startCampaign, levelEnd, levelAbort } from '#controllers';
import { validateBodyZod } from '#middlewares';
import { campaignStartBodySchema, campaignLevelEndBodySchema, campaignLevelAbortBodySchema } from '#schemas';

const router = Router();
router.use(authenticate);

router.post('/start', validateBodyZod(campaignStartBodySchema), startCampaign);
router.post('/levelEnd', validateBodyZod(campaignLevelEndBodySchema), levelEnd);
router.post('/levelAbort', validateBodyZod(campaignLevelAbortBodySchema), levelAbort);

export default router;
