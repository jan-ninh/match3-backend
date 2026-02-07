// src/app.ts
import express from 'express';
import cors from 'cors';
import { routes } from './routes/index.ts';
import { notFoundHandler, errorHandler } from '#middlewares';

export const app = express();

app.set('trust proxy', 1);

// CORS and JSON parsing MUST come FIRST
const allowedOrigins = ['http://localhost:5173', 'https://match3-frontend.onrender.com'];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'));
    },
  }),
);

app.use(express.json());

// Request logging
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// THEN mount routes
app.use(routes);

// Error handlers LAST
app.use(notFoundHandler);
app.use(errorHandler);
