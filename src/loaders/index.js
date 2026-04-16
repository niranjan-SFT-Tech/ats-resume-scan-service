// import connectMySQL from './mySQL.js';
import connectDB from './sequelize.js';
import expressLoader from './express.js';

export default async (app) => {
  // Every worker (Server & Background) must connect to the database, but only the server worker will initialize Express
  await connectDB();
  // ONLY workers passed an 'app' instance will initialize Express
  if (app) {
    expressLoader(app);
  } else {
    // Silent mode for background workers
    // console.log(`[PID ${process.pid}] Database connected, skipping Express loader.`);
  }
}