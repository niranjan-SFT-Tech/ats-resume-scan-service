import cluster from 'node:cluster';
import pkg from 'pg';
const { Pool } = pkg;

import {
  dbName,
  dbUser,
  dbPassword,
  dbHost,
  dbPort,
} from '../configs/index.js';

const pool = new Pool({
  host: dbHost,
  port: dbPort,
  user: dbUser,
  password: dbPassword,
  database: dbName,
  max: 40,  
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Keep same export name
export const promisePool = pool;

export { pool };

const connectMySQL = async () => {
  try {
    const client = await promisePool.connect();

    // only once log for getting success
    if (cluster.worker?.id === 1) {
      console.log("PostGres Connection Successful (Logged by Worker 1)");

      const result = await client.query('SELECT NOW() AS current_time');
      console.log('Current time from DB:', result.rows[0].current_time);
    }

    client.release();
  } catch (err) {
    console.error('PostGres Connection Error:', err.message);
  }
};

export default connectMySQL;