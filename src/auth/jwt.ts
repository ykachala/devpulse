/**
 * JWT utility — issues and validates application JWTs.
 * All signing uses HS256 with the application secret.
 */
import jwt from 'jsonwebtoken';

export interface JwtPayload {
  sub: string; // user id
  login: string;
}

/**
 * Signs a JWT payload with the given secret and expiry.
 * @param payload - The data to embed in the token
 * @param secret - HMAC secret
 * @param expiresIn - Duration string e.g. "7d"
 */
export function signToken(payload: JwtPayload, secret: string, expiresIn: string): string {
  return jwt.sign(payload, secret, { expiresIn } as jwt.SignOptions);
}

/**
 * Verifies a JWT and returns the decoded payload.
 * Throws if the token is invalid or expired.
 * @param token - The raw JWT string
 * @param secret - HMAC secret used for signing
 */
export function verifyToken(token: string, secret: string): JwtPayload {
  return jwt.verify(token, secret) as JwtPayload;
}
