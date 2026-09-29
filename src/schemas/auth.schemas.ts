// src/schemas/auth.schemas.ts
import { z } from 'zod';

export const registerSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(254),
    username: z.string().trim().min(3).max(50),
    password: z
      .string()
      .min(6)
      .refine((v) => Buffer.byteLength(v, 'utf8') <= 72, 'Password exceeds bcrypt limit'),
    confirmPassword: z
      .string()
      .min(6)
      .refine((v) => Buffer.byteLength(v, 'utf8') <= 72, 'Password exceeds bcrypt limit'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z
    .string()
    .min(1)
    .refine((v) => Buffer.byteLength(v, 'utf8') <= 72, 'Password exceeds bcrypt limit'),
});
