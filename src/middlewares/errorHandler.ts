// src/middlewares/errorHandler.ts
import type { ErrorRequestHandler } from 'express';
import { isHttpError } from '../utils/httpError.ts';

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (isHttpError(err)) {
    res.status(err.status).json({
      error: err.message,
      details: err.details ?? null,
    });
    return;
  }

  console.error('[error]', err);

  res.status(500).json({
    error: 'Internal Server Error',
  });
};
