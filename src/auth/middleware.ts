/**
 * JWT authentication middleware.
 * Reads the Authorization: Bearer <token> header, verifies the JWT,
 * and attaches the decoded payload to req.user.
 */
import { Request, Response, NextFunction } from 'express';
import { verifyToken, JwtPayload } from '@/auth/jwt';
import { loadConfig } from '@/config';

// Extend Express Request to carry the authenticated user payload
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

/**
 * Protects routes by requiring a valid JWT in the Authorization header.
 * Returns 401 Unauthorized if the header is missing or the token is invalid.
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ success: false, data: null, message: 'Unauthorized.' });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const config = loadConfig();
    const payload = verifyToken(token, config.jwt.secret);
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ success: false, data: null, message: 'Unauthorized.' });
  }
}
