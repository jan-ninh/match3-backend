// src/routes/auth.routes.ts
import { Router } from 'express';
import { register, login } from '../controllers/auth.controller.ts';
import { validateBodyZod } from '../middlewares/validateZod.ts';
import { registerSchema, loginSchema } from '../schemas/auth.schemas.ts';

const router = Router();
router.post('/register', validateBodyZod(registerSchema), register);
router.post('/login', validateBodyZod(loginSchema), login);
export default router;
