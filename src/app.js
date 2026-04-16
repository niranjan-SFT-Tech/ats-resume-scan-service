// import express from 'express';
// import { server_port } from './configs/index.js';
// import loader from './loaders/index.js';

// const app = express();

// loader(app);

// app.listen(server_port, err => {
//   if (err) {
//     console.log(err);
//     return process.exit(1);
//   }
//   console.log(`Server is running on ${server_port}`);
// });

// export default app



import cluster from 'node:cluster';
import os from 'node:os';
import process from 'node:process';
import express from 'express';
import { server_port } from './configs/index.js';
import loader from './loaders/index.js';
const totalCores = os.cpus().length;

if (cluster.isPrimary) {
  console.log(`Master PID ${process.pid} is running`);
  // 60/40 split
  const serverCount = Math.max(1, Math.floor(totalCores * 0.6));
  const workerCount = Math.max(1, totalCores - serverCount);
  console.log(`Allocating ${serverCount} API servers and ${workerCount} background workers`);
  const workerRoles = new Map();
  function forkWithRole(role) {
    const worker = cluster.fork({ ROLE: role });
    workerRoles.set(worker.id, role);
  }
  // Fork API servers
  for (let i = 0; i < serverCount; i++) {
    forkWithRole('main_server');
  }
  // Fork background workers
  for (let i = 0; i < workerCount; i++) {
    forkWithRole('background_task');
  }
  // Restart workers on crash
  cluster.on('exit', (worker, code, signal) => {
    const role = workerRoles.get(worker.id);
    workerRoles.delete(worker.id);
    console.log(`Worker ${worker.process.pid} died (code: ${code}, signal: ${signal}). Restarting...`);
    if (role) {
      forkWithRole(role);
    }
  });
  // Graceful shutdown for master
  process.on('SIGTERM', () => {
    console.log('Master shutting down...');
    for (const id in cluster.workers) {
      cluster.workers[id].kill();
    }
    process.exit(0);
  });
} else {
  const role = process.env.ROLE;
  // Crash safety/Global Error Handling
  process.on('uncaughtException', (err) => {
    console.error(`Uncaught Exception in PID ${process.pid}:`, err);
    process.exit(1);
  });
  process.on('unhandledRejection', (err) => {
    console.error(`Unhandled Rejection in PID ${process.pid}:`, err);
    process.exit(1);
  });
  // Main server
  if (role === 'main_server') {
    const app = express();
    loader(app).then(() => {
      const server = app.listen(server_port, () => {
        console.log(`[Server] Running on port ${server_port} (PID: ${process.pid})`);
      });
      // Graceful shutdown
      process.on('SIGTERM', () => {
        console.log(`[Server] PID ${process.pid} shutting down...`);
        server.close(() => process.exit(0));
      });
    });
  } 
  // Background Server
  else if (role === 'background_task') {
    loader(null).then(() => {
      console.log(`[Worker-bg] Background worker ready with DB (PID: ${process.pid})`);      
      const interval = setInterval(() => {
        // We can safely use DB here because loader() was called!
      }, 5000);
      process.on('SIGTERM', () => {
        console.log(`[Worker-bg] PID ${process.pid} shutting down...`);
        clearInterval(interval);
        process.exit(0);
      });
    });
  } 
  else {
    console.error(`Unknown ROLE in worker ${process.pid}`);
    process.exit(1);
  }
}
