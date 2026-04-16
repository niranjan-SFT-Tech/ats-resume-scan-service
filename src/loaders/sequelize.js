import cluster from 'node:cluster';
import pg from 'pg';
import { Sequelize } from 'sequelize';
import os from 'node:os';
import {
  dbName,
  dbUser,
  dbPassword,
  dbHost,
  dbPort,
  nodeEnv 
} from '../configs/index.js';

const totalWorkers = os.cpus().length;
const poolMax = Math.max(2, Math.floor(10 / totalWorkers));

//live db ssl option
const isProduction=nodeEnv==='production';
if(isProduction){
  pg.defaults.ssl = {
    require: true,
    rejectUnauthorized: false,
  };
}
const sequelize = new Sequelize(dbName, dbUser, dbPassword, {
  host: dbHost,
  port: parseInt(dbPort),
  dialect: 'postgres',
  logging: false,
  pool: {
    max: poolMax,
    min: 0,
    acquire: 30000,
    idle: 10000,
  },
  dialectOptions: isProduction ? {
    ssl: {
      require: true,
      rejectUnauthorized: false,
    },
  } : {},
});

export { sequelize };

const connectDB = async () => {
  try {
    await sequelize.authenticate();

    if (cluster.worker?.id === 1) {
      console.log("Sequelize PostgreSQL Connected (Worker 1)");
      const [result] = await sequelize.query('SELECT NOW()');
      console.log('DB Time:', result[0].now);
    }

  } catch (err) {
    console.error(`[Worker ${cluster.worker?.id ?? 'primary'}] DB Connection Failed:`, err.message);
    process.exit(1);
  }
};

export default connectDB;