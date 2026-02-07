// src/controllers/user.controller.ts
import type { RequestHandler } from 'express';
import { User } from '../models/User.model.ts';
import mongoose from 'mongoose';

export const getProfile: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id);

    if (!user) return res.status(404).json({ error: 'User not found' });

    const progress = Object.fromEntries(user.progress);

    res.json({
      username: user.username,
      avatar: user.avatar,
      powers: user.powers,
      totalScore: user.totalScore,
      progress,
      badges: user.badges,
      gamesPlayed: user.gamesPlayed,
      gamesWon: user.gamesWon,
      gamesLost: user.gamesLost,
    });
  } catch (err) {
    next(err);
  }
};

export const updateAvatar: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { avatar } = req.body as { avatar: string };

    const validAvatars = ['default.png', 'avatar1.png', 'avatar2.png', 'avatar3.png'];
    if (!validAvatars.includes(avatar)) {
      return res.status(400).json({ error: 'Invalid avatar' });
    }

    const user = await User.findByIdAndUpdate(id, { avatar }, { new: true });
    res.json({ avatar: user?.avatar });
  } catch (err) {
    next(err);
  }
};

/**
 * Update user powers.
 * Body: { powers: { bomb?: number, rocket?: number, extraTime?: number }, operation?: 'set' | 'add' }
 * operation='set' (default) -> set absolute values (non-negative)
 * operation='add' -> increment existing counts (can be positive only)
 */
export const updatePowers: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.params as { id: string };
    const { powers, operation } = req.body as {
      powers?: { bomb?: number; rocket?: number; extraTime?: number };
      operation?: 'set' | 'add';
    };

    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'invalid id' });
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ error: 'user not found' });

    // ensure powers object exists on user
    user.powers = user.powers ?? { bomb: 0, rocket: 0, extraTime: 0 };

    if (powers && typeof powers === 'object') {
      const op = operation === 'add' ? 'add' : 'set';

      if (op === 'add') {
        if (typeof powers.bomb === 'number') user.powers.bomb = Math.max(0, (user.powers.bomb || 0) + Math.floor(powers.bomb));
        if (typeof powers.rocket === 'number') user.powers.rocket = Math.max(0, (user.powers.rocket || 0) + Math.floor(powers.rocket));
        if (typeof powers.extraTime === 'number') user.powers.extraTime = Math.max(0, (user.powers.extraTime || 0) + Math.floor(powers.extraTime));
      } else {
        // set
        if (typeof powers.bomb === 'number') user.powers.bomb = Math.max(0, Math.floor(powers.bomb));
        if (typeof powers.rocket === 'number') user.powers.rocket = Math.max(0, Math.floor(powers.rocket));
        if (typeof powers.extraTime === 'number') user.powers.extraTime = Math.max(0, Math.floor(powers.extraTime));
      }
    } else {
      return res.status(400).json({ error: 'powers object is required' });
    }

    await user.save();

    res.json({
      id: user._id,
      powers: user.powers,
      message: operation === 'add' ? 'powers incremented' : 'powers updated',
    });
  } catch (err) {
    next(err);
  }
};
