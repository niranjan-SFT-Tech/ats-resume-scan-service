import express from 'express'
import cors from 'cors';
import compression from 'compression';
import morgan from 'morgan';
import helmet from 'helmet';
import multer  from 'multer';
import { prefix, upload_dir } from './../configs/index.js';
import routes from '../routes/index.js';
// import { logger } from '../utils/index.js';
import { rateLimiter, multiTenantHost, checkAuth } from '../middlewares/index.js';
// import { jwtSecretKey } from '../config/index.js';
import bodyParser from 'body-parser';
import { fileAPI } from '../utils/fileAPI.js';





export default (app) => {
  process.on('uncaughtException', async (error) => {
    console.log(error.message);
    // logger('00001', '', error.message, 'Uncaught Exception', '');
  });
  process.on('unhandledRejection', async (ex) => {
    console.log(ex.message);
    // logger('00002', '', ex.message, 'Unhandled Rejection', '');
  });
//   if (!jwtSecretKey) {
//     // console.log(ex);
//     // logger('00003', '', 'Jwtprivatekey is not defined', 'Process-Env', '');
//     process.exit(1);
//   }
  app.enable('trust proxy');
  app.use(cors());
  app.use(bodyParser.urlencoded({ extended: false }));
  app.use(bodyParser.json());
  app.use(morgan('dev'));
  app.use(helmet({frameguard: false,contentSecurityPolicy: false}));
  app.use(compression());
  app.use(express.static('public'));
  app.disable('x-powered-by');
  app.disable('etag');

  app.use(rateLimiter);
  // app.use(checkAuth);
  app.use(multiTenantHost);
  app.use(prefix, routes);

  app.get('/', (_req, res) => {
    return res.status(200).json({
      resultMessage: 'Project is successfully working...'
    }).end();
  });

  // app.get('/media/uploads/:filename', (_req, res) => {
  //   return res.status(200).file( `/../media/uploads/${_req.params.filename}`);
  // });
  // app.use('/uploads', express.static('media/uploads'));

  //file api
  app.get('/var/www/html/producthrmsmanagement/media/uploads/:filename', fileAPI);

  
  app.use((req, res, next) => {       
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    // res.header('Content-Security-Policy-Report-Only', 'default-src: https:');
    if (req.method === 'OPTIONS') {
      res.header('Access-Control-Allow-Methods', 'PUT POST PATCH DELETE GET');
      return res.status(200).json({});
    }
    next();
  });

  app.use((_req, _res, next) => {
    const error = new Error('Endpoint could not find!');
    error.status = 404;
    next(error);
  });

  app.use((error, req, res, _next) => {
    res.status(error.status || 500);
    let level = 'External Error';
    if (error.status === 500) {
      level = 'Server Error';
    } else if (error.status === 404) {
      level = 'Client Error';
    }
    return res.json({
      resultMessage: error.message 
    });

  });
}