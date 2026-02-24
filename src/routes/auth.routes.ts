// src/routes/auth.routes.ts
import { Router } from 'express';
import { register, login, logout } from '#controllers';
import { validateBodyZod } from '#middlewares';
import { registerSchema, loginSchema } from '#schemas';

const router = Router();
router.post('/register', validateBodyZod(registerSchema), register);
router.post('/login', validateBodyZod(loginSchema), login);
router.post('/logout', logout);
export default router;
