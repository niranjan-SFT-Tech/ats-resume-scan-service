
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url'; 
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


export const fileAPI=async (req, res) => {  
    const filePath = path.join(__dirname, '..', '..', 'media', 'uploads', req.params.filename);   
    // console.log('filePath', filePath);
    
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'File not found' });
    }
    return res.sendFile(filePath);
};