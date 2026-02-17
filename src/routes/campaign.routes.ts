// src/routes/campaign.routes.ts
import { Router } from 'express';
import { validateBodyZod } from '#middlewares';
import { campaignLevelAbortBodySchema, campaignLevelEndBodySchema, campaignStartBodySchema } from '#schemas';
import { campaignLevelAbort, campaignLevelEnd, startCampaign } from '#controllers';

const router = Router();

router.post('/start', validateBodyZod(campaignStartBodySchema), startCampaign);
router.post('/levelEnd', validateBodyZod(campaignLevelEndBodySchema), campaignLevelEnd);
router.post('/levelAbort', validateBodyZod(campaignLevelAbortBodySchema), campaignLevelAbort);

export default router;
