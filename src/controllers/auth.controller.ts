// src/controllers/auth.controller.ts
import type { RequestHandler } from 'express';
import { User } from '#models';
import { hashPassword, comparePassword } from '#utils';

export const register: RequestHandler = async (req, res, next) => {
  try {
    const { email, username, password } = req.body as { email: string; username: string; password: string };
    const exists = await User.findOne({ $or: [{ email }, { username }] });
    if (exists) return res.status(409).json({ error: 'Email or username already used' });

    const hashed = await hashPassword(password);
    const user = new User({
      email,
      username,
      password: hashed,
    });
    await user.save();

    // create initial leaderboard entry (score 0)
    // optional: we upsert on score change, so can skip

    res.status(201).json({ id: user._id, email: user.email, username: user.username, avatar: user.avatar });
  } catch (err) {
    next(err);
  }
};

export const login: RequestHandler = async (req, res, next) => {
  try {
    const { email, password } = req.body as { email: string; password: string };
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const ok = await comparePassword(password, user.password);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    // return minimal profile; client can store userId (beware: no token)
    res.json({ id: user._id, email: user.email, username: user.username, avatar: user.avatar, totalScore: user.totalScore, hearts: user.hearts });
  } catch (err) {
    next(err);
  }
};

// export const login: RequestHandler = async (req, res, next) => {
//   try {
//     console.log('[LOGIN] payload:', { body: req.body, envNODE: process.env.NODE_ENV });
//     const { email, password } = req.body;
//     const user = await User.findOne({ email });
//     console.log('[LOGIN] found user:', !!user);
//     if (!user) return res.status(401).json({ error: 'invalid credentials' });

//     const match = await comparePassword(password, user.password);
//     console.log('[LOGIN] bcrypt result:', match);
//     if (!match) return res.status(401).json({ error: 'invalid credentials' });

//     return res.status(200).json({ message: 'ok' });
//   } catch (err) {
//     if (err instanceof Error) {
//       console.error('[LOGIN ERROR]', err.stack);
//     } else {
//       console.error('[LOGIN ERROR]', err);
//     }
//     return res.status(500).json({ error: 'Internal Server Error' });
//   }
// };
