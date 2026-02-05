// src/middlewares/validateZod.ts
import type { RequestHandler } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';
import type { ZodSchema } from 'zod';

export const validateBodyZod =
  (schema: ZodSchema): RequestHandler =>
  (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: 'Invalid body', issues: result.error.format() });
    }
    req.body = result.data;
    next();
  };

export const validateParamsZod =
  <T extends ParamsDictionary>(schema: ZodSchema): RequestHandler<T> =>
  (req, res, next) => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      return res.status(400).json({ error: 'Invalid params', issues: result.error.format() });
    }
    req.params = result.data as T;
    next();
  };
