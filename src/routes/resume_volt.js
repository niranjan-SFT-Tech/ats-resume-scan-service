import { Router } from 'express';
// import {  resume } from '../controllers/user/index.js';
import {
    uploadResume, 
    resumeVoltList, 
    updateResumeVolt, 
    searchResumeVolt, 
    searchResumeVoltByJobPost, 
    resumeVoltListSearchByJobPost, 
    resumeVaultScan,
    getCountResumeVolt,
    pdfProxy
} from '../controllers/index.js';
import {fileUploader, createUploadMiddleware } from '../middlewares/index.js';

const router = Router(); 
router
    .post('/upload-resume', fileUploader, uploadResume) // bulk resume upload 
    .put('/upload-resume/:id', createUploadMiddleware({maxFiles:1, maxFiles:150}), updateResumeVolt) // update resume data for specific resumeVoltId
    .get('/get-resume-list/:id', resumeVoltList) // get resume data for specific resumeVoltId
    .get('/get-total-resume-count', getCountResumeVolt) // get resume data for specific resumeVoltId
    .get('/get-resume-list', resumeVoltList) // get resume list
    .get('/search-resume', searchResumeVolt) // Search Resume Volt    
    .post('/resumeSearchById', searchResumeVoltByJobPost) // short Resume Volt by job details
    .get('/get-resume-list-by-job-post', resumeVoltListSearchByJobPost) // resume list
    .put('/resume-scan-by-job-post/:jobID', resumeVaultScan) // resume list
    .get('/pdf-proxy',pdfProxy)

export default router