import express from 'express';
import cors from 'cors';

import { routes } from './routes/index.ts';
import { notFoundHandler } from './middlewares/notFoundHandler.ts';
import { errorHandler } from './middlewares/errorHandler.ts';

export const app = express();

app.set('trust proxy', 1);
app.use(express.json());

const allowedOrigins = ['http://localhost:5173', 'https://match3-frontend.onrender.com'];

app.use(
  cors({
    origin: (origin, callback) => {
      // allow server-to-server / health checks
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) return callback(null, true);

      return callback(new Error('Not allowed by CORS'));
    },
  }),
);

app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

app.use(routes);

app.use(notFoundHandler);
app.use(errorHandler);
