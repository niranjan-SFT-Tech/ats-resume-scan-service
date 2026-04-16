// import { RateLimiterMySQL } from 'rate-limiter-flexible';
// import { pool } from '../loaders/mySQL.js'; // Now the correct callback-style pool

// const opts = {
//   storeClient: pool,
//   tableName: 'rateLimits',
//   points: 100,
//   duration: 60,
// };

// const rateLimiterMySQL = new RateLimiterMySQL(opts, (err) => {
//   if (err) {
//     console.error('Rate Limiter MySQL Setup Error:', err);
//   } else {
//     console.log('Rate Limiter MySQL Ready');
//   }
// });

// export default (req, res, next) => {
//   rateLimiterMySQL.consume(req.ip || 'unknown')
//     .then(() => {
//       next();
//     })
//     .catch((err) => {
//       const secs = Math.round(err.msBeforeNext / 1000) || 1;
//       res.set('Retry-After', String(secs));
//       return res.status(429).json({ resultMessage: err.message || 'Too Many Requests' });
//     });
// };


import { RateLimiterPostgres } from 'rate-limiter-flexible';
import pkg from 'pg';
import {
  dbName,
  dbUser,
  dbPassword,
  dbHost,
  dbPort,
} from '../configs/index.js';

const { Pool } = pkg;

const rateLimitPool = new Pool({
  host: dbHost,
  port: dbPort,
  user: dbUser,
  password: dbPassword,
  database: dbName,
  max: 10, // small pool just for limiter
});

const opts = {
  storeClient: rateLimitPool,
  tableName: 'public.rate_limits',
  points: 100,
  duration: 60,
};

const rateLimiter = new RateLimiterPostgres(opts);

export default async (req, res, next) => {
  try {
    await rateLimiter.consume(req.ip || 'unknown');
    next();
  } catch (err) {
    const secs = Math.round(err.msBeforeNext / 1000) || 1;
    res.set('Retry-After', String(secs));
    return res.status(429).json({
      resultMessage: err.message || 'Too Many Requests',
    });
  }
};