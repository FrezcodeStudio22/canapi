import jwt from 'jsonwebtoken';
import { unauthorized } from './errors.js';

const defaultSecret = process.env.JWT_SECRET || 'supersecretjwtkey';

export function createAuth(options = {}) {
  const secret = options.secret || defaultSecret;
  const expiresIn = options.expiresIn || '1h';

  function sign(user) {
    return jwt.sign(user, secret, { expiresIn });
  }

  function verify(token) {
    return jwt.verify(token, secret);
  }

  function authenticate(req, res, next) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return next(unauthorized('Missing or malformed Authorization header'));
    }
    try {
      req.user = verify(header.slice(7));
      next();
    } catch {
      next(unauthorized('Invalid or expired token'));
    }
  }

  function loginHandler(validate) {
    return async (req, res, next) => {
      try {
        const credentials = req.body || {};
        const user = await validate(credentials);
        if (!user) {
          return next(unauthorized('Invalid credentials'));
        }
        res.json({ token: sign(user), user });
      } catch (err) {
        next(err);
      }
    };
  }

  return { sign, verify, authenticate, loginHandler, secret };
}