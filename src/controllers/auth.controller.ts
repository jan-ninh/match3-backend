import type { RequestHandler, Response } from 'express';
import { User, RefreshToken } from '#models';
import { hashPassword, comparePassword, createAccessToken, createRefreshToken } from '#utils';
import { REFRESH_TOKEN_TTL } from '#config';

function setAuthCookie(res: Response, accessToken: string, refreshToken: string) {
  const isProd = process.env.NODE_ENV === 'production';

  const sameSite: 'none' | 'lax' = isProd ? 'none' : 'lax';
  const cookieOptions = {
    httpOnly: true,
    secure: isProd,
    sameSite: sameSite,
    path: '/',
  };

  res.cookie('accessToken', accessToken, {
    ...cookieOptions,
    maxAge: 15 * 60 * 1000,
  });

  res.cookie('refreshToken', refreshToken, {
    ...cookieOptions,
    maxAge: REFRESH_TOKEN_TTL * 1000,
  });
}

export const register: RequestHandler = async (req, res, next) => {
  try {
    const { email, username, password } = req.body as { email: string; username: string; password: string };

    const exists = await User.findOne({ $or: [{ email }, { username }] });
    if (exists) return res.status(409).json({ error: 'Email or username already used' });

    const hashed = await hashPassword(password);
    const user = new User({ email, username, password: hashed });
    await user.save();

    const accessToken = await createAccessToken({ id: user._id });
    const refreshToken = await createRefreshToken(user._id);

    setAuthCookie(res, accessToken, refreshToken);

    res.status(201).json({
      id: user._id,
      email: user.email,
      username: user.username,
      avatar: user.avatar,
    });
  } catch (err) {
    next(err);
  }
};

export const login: RequestHandler = async (req, res, next) => {
  try {
    const { email, password } = req.body as { email: string; password: string };

    const user = await User.findOne({ email }).select('+password');
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const ok = await comparePassword(password, user.password);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    const accessToken = await createAccessToken({ id: user._id });
    const refreshToken = await createRefreshToken(user._id);

    setAuthCookie(res, accessToken, refreshToken);

    res.json({
      id: user._id,
      email: user.email,
      username: user.username,
      avatar: user.avatar,
      totalScore: user.totalScore,
      hearts: user.hearts,
    });
  } catch (err) {
    next(err);
  }
};

export const logout: RequestHandler = async (req, res, next) => {
  try {
    const { refreshToken } = req.cookies;

    if (refreshToken) {
      await RefreshToken.findOneAndDelete({ token: refreshToken });
    }

    const isProd = process.env.NODE_ENV === 'production';

    const clearOptions = {
      path: '/',
      sameSite: isProd ? ('none' as const) : ('lax' as const),
      secure: isProd,
    };

    res.clearCookie('accessToken', clearOptions);
    res.clearCookie('refreshToken', clearOptions);

    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
};
