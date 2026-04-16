import { Router } from 'express'; 
import candidate from './candidate.js';
import resume_volt  from './resume_volt.js';
// import candidatefrom './candidate.js';
const router = Router();

router.use('/candidate', candidate); // candidate routes
router.use('/resume-volt', resume_volt); // resume volt routes

export default router;