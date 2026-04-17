// import multer, { diskStorage } from 'multer';
// import path from 'path';
// import fs from 'fs';
// import { upload_dir } from '../configs/index.js';
// // Ensure upload directory exists
// console.log(upload_dir,"upload_dir")
// if (!fs.existsSync(upload_dir)) {
//   fs.mkdirSync(upload_dir, { recursive: true }); 
// }
// // Configure disk storage
// const storage = diskStorage({
//   destination: (_req, _file, cb) => {
//     // console.log(upload_dir,"upload_dir-------")
//     cb(null, upload_dir);
//   },
//   filename: (_req, file, cb) => {
//     const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
//     const ext = path.extname(file.originalname);
//     const nameWithoutExt = path.basename(file.originalname, ext);
//     // Remove special characters
//     const cleanName = nameWithoutExt.replace(/[^a-zA-Z0-9]/g, '-');
//     // console.log(cleanName,"cleanName")
//     cb(null, `${cleanName}-${uniqueSuffix}${ext}`);
//   },
// });
// // console.log(storage,"storage")
// // Default export
// export default multer({
//   storage,
//   limits: {
//     fileSize: 5 * 1024 * 1024,
//     files: 100,
//   },
// }).any();
// // Create dynamic upload middleware
// export const createUploadMiddleware = (options = {}) => {
//   const {maxFileSize = 5 * 1024 * 1024, maxFiles = 100,} = options;
//   console.log(`Creating upload middleware with options: maxFileSize=${maxFileSize}, maxFiles=${maxFiles}`);
//   return multer({
//     storage,
//     limits: {
//       fileSize: maxFileSize,
//       files: maxFiles,
//     },
//   }).any(); // accepts multiple files with any field name
// };

// import multer from 'multer';
// import multerS3 from 'multer-s3';
// import { S3Client } from '@aws-sdk/client-s3';
// import path from 'path';
 
// // Initialize S3 client
// const s3Client = new S3Client({
//   region: process.env.AWS_REGION,
//   credentials: {
//     accessKeyId: process.env.AWS_ACCESS_KEY_ID,
//     secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
//   },
// });
 
// const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME;
 
// // Configure S3 storage
// const createS3Storage = (folder = 'uploads') =>
//   multerS3({
//     s3: s3Client,
//     bucket: BUCKET_NAME,
//     contentType: multerS3.AUTO_CONTENT_TYPE,
//     key: (_req, file, cb) => {
//       const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
//       const ext = path.extname(file.originalname);
//       const nameWithoutExt = path.basename(file.originalname, ext);
//       // Remove special characters
//       const cleanName = nameWithoutExt.replace(/[^a-zA-Z0-9]/g, '-');
//       cb(null, `${folder}/${cleanName}-${uniqueSuffix}${ext}`);
//     },
//   });
 
// // Default export
// export default multer({
//   storage: createS3Storage(),
//   limits: {
//     fileSize: 5 * 1024 * 1024,
//     files: 100,
//   },
// }).any();
 
// // Create dynamic upload middleware
// export const createUploadMiddleware = (options = {}) => {
//   const {
//     maxFileSize = 5 * 1024 * 1024,
//     maxFiles = 100,
//     folder = 'uploads',
//   } = options;
 
//   console.log(`Creating upload middleware with options: maxFileSize=${maxFileSize}, maxFiles=${maxFiles}, folder=${folder}`);
 
//   return multer({
//     storage: createS3Storage(folder),
//     limits: {
//       fileSize: maxFileSize,
//       files: maxFiles,
//     },
//   }).any();
// };
 
// // Helper to extract S3 URL from uploaded file
// export const getFileUrl = (file) => file.location ?? null;
 
// // Helper to extract S3 key from URL (useful for deletion)
// export const getKeyFromUrl = (url) => {
//   const urlObj = new URL(url);
//   return urlObj.pathname.slice(1); // remove leading slash
// };

import multer, { diskStorage } from "multer";
import path from "path";
import fs from "fs";
import { media_root_path , media_sub_folder_path } from '../configs/index.js'
const MEDIA_ROOT = media_root_path ;
const MEDIA_SUB_PATH = media_sub_folder_path
const ensureDirExists = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};
const storage = diskStorage({
  destination: (req, _file, cb) => {
    const uploadPath = req.body.uploadPath || 'common';
    // FINAL ABSOLUTE PATH
    const finalPath = path.join(
      MEDIA_ROOT,
      uploadPath.replace(/^\/+|\/+$/g, "")
    );
    ensureDirExists(finalPath);
    cb(null, finalPath);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = path
      .basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9]/g, "-");
    cb(null, `${name}-${Date.now()}${ext}`);
  },
});
export default multer({ storage }).any();
export const createUploadMiddleware = (options = {}) => {
  const {
    maxFileSize = 5 * 1024 * 1024,
    maxFiles = 100,
  } = options;

  return multer({
    storage,
    limits: {
      fileSize: maxFileSize,
      files: maxFiles,
    },
  }).any();
};