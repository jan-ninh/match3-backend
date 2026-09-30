import express from 'express';
import cors from 'cors';
import { routes } from './routes/index.ts';
import { notFoundHandler, errorHandler } from '#middlewares';
import { env } from './utils/env.ts';
export const app = express();
app.disable('x-powered-by');
app.set('trust proxy', env.trustProxyHops);
app.use(
  cors({
    origin: (origin, callback) => callback(null, Boolean(origin && env.allowedOrigins.includes(origin))),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
);
app.use(express.json({ limit: '64kb' }));
app.use(routes);
app.use(notFoundHandler);
app.use(errorHandler);
