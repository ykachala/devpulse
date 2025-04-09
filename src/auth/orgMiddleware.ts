/**
 * Organisation API key authentication middleware.
 * Reads the Authorization: Bearer <key> header, hashes it with SHA-256,
 * and looks up the Org by the hash. Attaches req.org to the request.
 */
import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { db } from '@/db/client';

// Extend Express Request to carry the authenticated org
declare global {
  namespace Express {
    interface Request {
      org?: { id: string; name: string };
    }
  }
}

/**
 * Protects routes that require a valid org API key.
 * Returns 401 if the key is missing or not associated with any organisation.
 */
export async function orgMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ success: false, data: null, message: 'Unauthorized.' });
    return;
  }

  const rawKey = authHeader.slice(7);
  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

  try {
    const org = await db.org.findUnique({
      where: { apiKeyHash: keyHash },
      select: { id: true, name: true },
    });

    if (!org) {
      res.status(401).json({ success: false, data: null, message: 'Unauthorized.' });
      return;
    }

    req.org = { id: org.id, name: org.name };
    next();
  } catch {
    res.status(500).json({ success: false, data: null, message: 'Internal server error.' });
  }
}
