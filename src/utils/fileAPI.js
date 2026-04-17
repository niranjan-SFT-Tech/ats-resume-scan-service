
// import fs from 'fs-extra';
// import path from 'path';
import { fileURLToPath } from 'url'; 
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


//old code
// export const fileAPI=async (req, res) => {  
//     const filePath = path.join(__dirname, '..', '..', 'media', 'uploads', req.params.filename);   
//     console.log('--filePath--', filePath);
    
//     if (!fs.existsSync(filePath)) {
//         return res.status(404).json({ error: 'File not found' });
//     }
//     return res.sendFile(filePath);
// };

import fs from "fs";
import path from "path";
import {media_root_path} from '../configs/index.js'
const MEDIA_ROOT = media_root_path;
export const fileAPI = async (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(MEDIA_ROOT, "uploads", filename);
//   console.log("--filePath--", filePath);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "File not found" });
  }
  return res.sendFile(filePath);
};