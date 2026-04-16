import { Router } from 'express';
// import {  resume } from '../controllers/user/index.js';
import {  candidatePool, resumeScan, jobPostUpdate } from '../controllers/index.js';

const router = Router();

router.get('/', candidatePool) //get candidate Pool list
      .post('/', resumeScan) //candidate pool => resume scan
      .post('/update-job-post', jobPostUpdate) // add candidate from Pool in job post


export default router