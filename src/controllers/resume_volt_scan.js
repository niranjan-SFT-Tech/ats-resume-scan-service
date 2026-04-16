// import { promisePool } from '../loaders/mySQL.js'; 
import { tenantQuery } from '../utils/tenantQuery.js';
import { sequelize } from '../loaders/sequelize.js';
import { githubModel } from '../configs/index.js'; 
import fs from 'fs-extra';
import path from 'path';  
import { pdfExtractort, downloadFile } from '../utils/pdfExtract.js';
import AI_model from '../utils/AI_model.js';
import { resumeVaultToCandidateMap } from './resume_vault_candidate.js';
import { searchTextElaborated } from '../utils/text-embedding.js';


  
const TEMP_DIR = './temp'; //for tempurary cv download
await fs.ensureDir(TEMP_DIR);

// export const resumeVaultScan= async (req, res)=>{
//     try {
//         const {userID, job_title, job_des, resumeIds = [], keywords = [], isAutoShortlist=false, url, slectedMinScore=70 } = req.body;   
//         const job_id= req.params.jobID;      
//         if (resumeIds.length === 0) {
//             return res.status(400).json({ success: false, resultMessage: 'No Resume provided' });
//         }
//         if(!job_id){
//             return res.status(400).json({
//                 success: false,
//                 resultMessage: `Job ID are missing`
//             });
//         }
//         //if job_des not found then job job_title enhahance with ai model
//         const jobDescription= !job_des || job_des.trim() === '' ? await searchTextElaborated('Job profile for : '+ job_title) : job_des ;
//         const results = [];
//         const errorList = [];
//         for (const resumeVaultID of resumeIds) {
//             try {
//                 await sequelize.transaction(async (transaction) => {
//                   const task = await resumeScan(resumeVaultID, job_id, jobDescription, keywords, slectedMinScore, req.tenant, transaction);
//                   if(isAutoShortlist && task?.shortlist){
//                       const candidateMapDetails = await resumeVaultToCandidateMap(userID, task, 'Shortlisted', job_id, resumeVaultID, req.tenant, transaction);                                              
//                       if(candidateMapDetails && candidateMapDetails.isSaved){
//                           Object.assign(task, {
//                               autoShort: true,
//                               jobMapID: candidateMapDetails.candidateJobMapId
//                           });
//                           //---------------------------------------------                        
//                           if (task) results.push(task);
//                       }else{
//                           errorList.push(candidateMapDetails.errorMsg || `Failed to map candidate for resumeVaultID: ${resumeVaultID}`);
//                       }
//                   }else{
//                     if (task) results.push(task);
//                   }
//                 });

//                 // Safe delay for free tier (~3-4 RPM) //For free AI model, If you use Paid AI model then you can remove below code
//                 await new Promise(resolve => setTimeout(resolve, 4000));
//                 //
//             }catch (err) {
//                 console.error(`Error processing candidate ${resumeVaultID}:`, err.message);
//             }
//         }  
         
//         return res.status(200).json({
//             success: true,
//             count: results.length,
//             shortlist_count:results.filter(x=>x.shortlist)?.length || 0,
//             ats_failed_count:results.filter(x=>!x.ats)?.length || 0,
//             rejected_count:results.filter(x=>!x.shortlist)?.length || 0,
//             results,
//             errorList
//         }); 
//     }
//     catch(error) {
//         return res.status(500).json({
//             success: false,
//             resultMessage: 'Internal server error',
//             error: error.message,
//         });
//     } finally {
      
//     }
// }

// ////////////////////////////////////////////////////////////

// async function resumeScan(resumeVaultID, jobId, jobDescription, keywords, slectedMinScore, tenant, transaction) {
//   const uniquePath = path.join(TEMP_DIR, `resume_${resumeVaultID}_${Date.now()}.pdf`);
//   try {
//     let responseModel={
//       resumeVaultID,
//       jobId,
//       score: 0,
//       matchedKeywords: [], 
//       suggestedImprovements: [],
//       shortlist: false, 
//       reasons:null,
//       ats:false, 
//       autoShort:false
//     };  
//     //Resume Details find form vault
//     const resumeVaultDetails = await tenantQuery(  
//       tenant,
//       `SELECT 
//           rvur.*,
//           cufum_resume.file_link AS resume_file_link
//       FROM resume_volt_uploaded_resumes AS rvur  
//       LEFT JOIN core_uploaded_file_url_master AS cufum_resume 
//           ON cufum_resume.id = rvur.resume_id 
//       WHERE rvur.id = :resumeVaultID`,
//       {
//         replacements: { resumeVaultID }
//       },
//       transaction
//     );        
//     if(!resumeVaultDetails.length){
//         return {
//             ...responseModel,
//             reasons: 'Resume not found in vault'
//         }
//     }       
//     responseModel={ ...responseModel,  ...resumeVaultDetails[0] } 
//     const fileExt = resumeVaultDetails[0].resume_file_link ? path.extname(new URL(resumeVaultDetails[0].resume_file_link).pathname).toLowerCase() : null;
//     if(!resumeVaultDetails[0].resume_file_link || fileExt !== '.pdf') {
//         return {
//             ...responseModel,
//             reasons: !resumeVaultDetails[0].resume_file_link ? 'Resume not found' : `Only PDF files are allowed for ATS. Found: ${fileExt || 'unknown'}`,
//             suggestedImprovements: [
//                 'Please upload a valid PDF file that is ATS-compatible',
//                 'Please tailor your resume to match the job description'
//             ]
//         };
//     }
//     //checking candidate ATS scan data from scaning table before AI pass
//     const scanTableData = await tenantQuery( 
//       tenant,
//       `SELECT * 
//       FROM resume_vault_scans 
//       WHERE resume_volt_id = :resumeVaultID  
//       AND job_id = :jobId`,
//       {
//         replacements: { resumeVaultID, jobId }
//       },
//       transaction
//     );
//     const resumeINscna=scanTableData && scanTableData.length ? scanTableData[0] : null;   
//     if(resumeINscna){
//       return {
//         ...responseModel,
//         score: resumeINscna.scaning_data.score || 0,
//         matchedKeywords: resumeINscna.scaning_data.matchedKeywords || [], 
//         suggestedImprovements: resumeINscna.scaning_data.suggestedImprovements || [],
//         shortlist: resumeINscna.scaning_data.shortlist, 
//         reasons:resumeINscna.scaning_data.reasons,
//         ats:true,
//       }
//     } 
//     /////////Start Proccess of AI Model scan 
//     await downloadFile(resumeVaultDetails[0].resume_file_link, uniquePath); 
//     const resumeText = await pdfExtractort(uniquePath);     
//     //Send prompt, githubModel, and output  
//     const ResumePrompt = `You are an expert recruiter with extensive experience in evaluating candidates across various industries. 
//         Your assessments are unbiased, thorough, and based solely on the provided job description, required keywords, and resume content. 
//         Focus on matching skills, experience, education, achievements, cultural fit where applicable, and ATS compatibility.

//         Job Description:
//         ${jobDescription}  

//         Required Keywords: ${keywords || 'None'} (Consider synonyms, variations, and related terms when matching, e.g., "React.js" matches "React" or "ReactJS". If no keywords provided, evaluate based on JD alone.)

//         Resume Content:
//         ${resumeText}

//         Evaluation Guidelines:
//         - Analyze the resume for relevance in: skills (technical or otherwise as per JD), professional experience (duration, roles, responsibilities), education/qualifications, projects/accomplishments, and any soft skills mentioned in the JD.
//         - Evaluate ATS compatibility: Check for standard structure (e.g., clear section headings like 'Experience', 'Education', 'Skills'), use of bullet points for readability, chronological order in experience, absence of tables/graphics (infer from text patterns), standard fonts implied by plain text, no unusual characters or formatting that could break parsing. Penalize for poor structure, non-standard headings, or content that suggests incompatibility (e.g., mentions of images, complex layouts).
//         - Be strict but fair: Penalize for gaps in core requirements or ATS issues, but credit transferable skills or equivalent experience.
//         - Score calculation: 
//         - 90-100: Exceptional match (meets all key requirements, exceeds in multiple areas, highly ATS compatible).
//         - 80-89: Strong match (meets most requirements with minor gaps, good ATS compatibility).
//         - 70-79: Good potential (meets core requirements but has some gaps or minor ATS issues; trainable).
//         - 50-69: Moderate match (partial alignment; significant gaps or ATS concerns).
//         - 0-49: Low/Poor match (Major mismatches, insufficient relevant experience, or severe ATS parsing risk)
//         - Matched Keywords: List exact matches or close synonyms from the resume that align with required keywords or JD.
//         - Reasons: Provide 3-5 concise, bullet-point-style explanations for the score, highlighting strengths, weaknesses, and ATS compatibility aspects.
//         - Shortlist: "Yes" only if score >= ${slectedMinScore||'70'}, no critical red flags (e.g., unrelated experience, ethical issues, major ATS parsing risks). Otherwise, "No".
//         - Suggested Improvements: Offer 2-4 actionable, specific recommendations to strengthen the resume for this role, including ATS optimizations (e.g., "Use standard headings like 'Professional Experience' instead of custom ones", "Quantify achievements with metrics like 'increased efficiency by 30%'").

//         Respond with valid JSON only in this exact format:
//         {
//         "score": 0-100,
//         "matchedKeywords": ["keyword1", "keyword2"],
//         "reasons": ["Brief reason 1", "Brief reason 2", "Brief reason 3"],
//         "shortlist": true or false (only boolean return as per "Yes" or "No"),
//         "suggestedImprovements": ["Improvement 1", "Improvement 2"]
//         }

//         Rules:
//         - Base evaluation purely on provided content; do not assume or infer unstated information.
//         - Ensure JSON is parsable: Use double quotes, no trailing commas, arrays for lists.
//         - Return ONLY the JSON object. No additional text, markdown, explanations, or code.`;    
//     const prompt = [
//         { 
//             role: "system", 
//             content: "You must output ONLY valid JSON. Do NOT provide reasoning." 
//         },
//         { 
//             role: 'user', 
//             content: ResumePrompt 
//         }
//     ]; 
//     const result = await AI_model(prompt, githubModel, true);    
//     if (!result){
//       return {
//         ...responseModel,
//         reasons: 'AI evaluation failed'
//       }
//     } 
//     // DB query check--------------------
//     const existing = await tenantQuery( 
//       tenant,
//       `SELECT id 
//       FROM resume_vault_scans 
//       WHERE resume_volt_id = :resumeVaultID 
//       AND job_id = :jobId
//       LIMIT 1`,
//       {
//         replacements: { resumeVaultID, jobId }
//       },
//       transaction
//     );     
//     if (existing.length > 0) {
//         //update
//         await tenantQuery( 
//           tenant,
//           `UPDATE resume_vault_scans 
//           SET scaning_data = :scaning_data,
//               updated_at = :updated_at
//           WHERE id = :id
//           AND resume_volt_id = :resumeVaultID
//           AND job_id = :jobId`,
//           {
//             replacements: {
//               scaning_data: JSON.stringify(result),
//               updated_at: new Date(),
//               id: existing[0].id,
//               resumeVaultID,
//               jobId
//             },
//             returnMeta: true
//           },
//           transaction
//         );
//         return {
//             ...responseModel,
//             id: existing[0].id,
//             ats:true,
//             //---AI Data overwrite---
//             score: result.score,
//             matchedKeywords: result.matchedKeywords,
//             reasons: result.reasons || [],
//             suggestedImprovements: result.suggestedImprovements || [],
//             shortlist: result.shortlist
//         };
//     }else{
//       //new add
//       const insertResult = await tenantQuery(
//         tenant,
//         `INSERT INTO resume_vault_scans
//         (resume_volt_id, job_id, scaning_data, created_at)
//         VALUES (:resumeVaultID, :jobId, :scaning_data, :created_at)
//         RETURNING id`,
//         {
//           replacements: {
//             resumeVaultID,
//             jobId,
//             scaning_data: JSON.stringify(result),
//             created_at: new Date()
//           }
//         },
//         transaction
//       );
//       return {
//         ...responseModel,
//         id: insertResult[0]?.id,
//         ats:true,
//         //---AI Data overwrite---
//         score: result.score,
//         matchedKeywords: result.matchedKeywords,
//         reasons: result.reasons || [],
//         suggestedImprovements: result.suggestedImprovements || [],
//         shortlist: result.shortlist
//       };
//     }    
//   } catch (error) {
//     console.error(`Failed for candidate ${resumeVaultID}:`, error.message);
//     await fs.remove(uniquePath).catch(() => {});
//     return null; // or return an object with error details if you want to capture this in results
//   } finally {
//     await fs.remove(uniquePath).catch(() => {});
//   }
// }

export const resumeVaultScan = async (req, res) => {
    try {
        const { userID, job_title, job_des, resumeIds = [], keywords = [], 
                isAutoShortlist = false, slectedMinScore = 70 } = req.body;
        const job_id = req.params.jobID;

        if (resumeIds.length === 0)
            return res.status(400).json({ success: false, resultMessage: 'No Resume provided' });
        if (!job_id)
            return res.status(400).json({ success: false, resultMessage: 'Job ID is missing' });

        const jobDescription = !job_des || job_des.trim() === ''
            ? await searchTextElaborated('Job profile for : ' + job_title)
            : job_des;

        const results = [];
        const errorList = [];

        for (const resumeVaultID of resumeIds) {
            try {
                const task = await resumeScan(
                    resumeVaultID, job_id, jobDescription, 
                    keywords, slectedMinScore, req.tenant
                );

                if (isAutoShortlist && task?.shortlist) {
                    // Only open transaction for DB writes
                    await sequelize.transaction(async (transaction) => {
                        const candidateMapDetails = await resumeVaultToCandidateMap(
                            userID, task, 'Shortlisted', job_id, 
                            resumeVaultID, req.tenant, transaction
                        );
                        // console.log(candidateMapDetails,"--candidateMapDetails");
                        if (candidateMapDetails?.isSaved) {
                            Object.assign(task, {
                                autoShort: true,
                                jobMapID: candidateMapDetails.candidateJobMapId
                            });
                            results.push(task);
                        } else {
                            errorList.push(candidateMapDetails?.errorMsg 
                                || `Failed to map candidate for resumeVaultID: ${resumeVaultID}`);
                        }
                    });
                } else {
                    if (task) results.push(task);
                }

                await new Promise(resolve => setTimeout(resolve, 4000));
            } catch (err) {
                console.error(`Error processing candidate ${resumeVaultID}:`, err.message);
                errorList.push(`Error processing resumeVaultID ${resumeVaultID}: ${err.message}`);
            }
        }

        return res.status(200).json({
            success: true,
            count: results.length,
            shortlist_count: results.filter(x => x.shortlist)?.length || 0,
            ats_failed_count: results.filter(x => !x.ats)?.length || 0,
            rejected_count: results.filter(x => !x.shortlist)?.length || 0,
            results,
            errorList
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            resultMessage: 'Internal server error',
            error: error.message,
        });
    }
};


async function resumeScan(resumeVaultID, jobId, jobDescription, keywords, slectedMinScore, tenant) {
  const uniquePath = path.join(TEMP_DIR, `resume_${resumeVaultID}_${Date.now()}.pdf`);
  
  try {
    let responseModel = {
      resumeVaultID, jobId,
      score: 0, matchedKeywords: [],
      suggestedImprovements: [], shortlist: false,
      reasons: null, ats: false, autoShort: false
    };

    // ── PHASE 1: Short read queries ───────────────────────────────────────
    const { resumeVaultDetails, scanTableData } = await sequelize.transaction(async (t) => {
      const resumeVaultDetails = await tenantQuery(
        tenant,
        `SELECT rvur.*, cufum_resume.file_link AS resume_file_link
         FROM resume_volt_uploaded_resumes AS rvur
         LEFT JOIN core_uploaded_file_url_master AS cufum_resume 
             ON cufum_resume.id = rvur.resume_id
         WHERE rvur.id = :resumeVaultID`,
        { replacements: { resumeVaultID } },
        t
      );

      if (!resumeVaultDetails.length) return { resumeVaultDetails, scanTableData: [] };

      const scanTableData = await tenantQuery(
        tenant,
        `SELECT * FROM resume_vault_scans 
         WHERE resume_volt_id = :resumeVaultID AND job_id = :jobId
         LIMIT 1`,
        { replacements: { resumeVaultID, jobId } },
        t
      );

      return { resumeVaultDetails, scanTableData };
    });
    // ── Transaction closed ────────────────────────────────────────────────

    if (!resumeVaultDetails.length) {
      return { ...responseModel, reasons: 'Resume not found in vault' };
    }

    responseModel = { ...responseModel, ...resumeVaultDetails[0] };

    const fileExt = resumeVaultDetails[0].resume_file_link
      ? path.extname(new URL(resumeVaultDetails[0].resume_file_link).pathname).toLowerCase()
      : null;

    if (!resumeVaultDetails[0].resume_file_link || fileExt !== '.pdf') {
      return {
        ...responseModel,
        reasons: !resumeVaultDetails[0].resume_file_link
          ? 'Resume not found'
          : `Only PDF files are allowed for ATS. Found: ${fileExt || 'unknown'}`,
        suggestedImprovements: [
          'Please upload a valid PDF file that is ATS-compatible',
          'Please tailor your resume to match the job description'
        ]
      };
    }

    // Return cached scan if exists
    const resumeINscna = scanTableData?.[0] ?? null;
    if (resumeINscna) {
      return {
        ...responseModel,
        score:                resumeINscna.scaning_data.score                 || 0,
        matchedKeywords:      resumeINscna.scaning_data.matchedKeywords       || [],
        suggestedImprovements:resumeINscna.scaning_data.suggestedImprovements || [],
        shortlist:            resumeINscna.scaning_data.shortlist,
        reasons:              resumeINscna.scaning_data.reasons,
        ats: true,
      };
    }

    // ── PHASE 2: Heavy async — NO transaction held ────────────────────────
    await downloadFile(resumeVaultDetails[0].resume_file_link, uniquePath);
    const resumeText = await pdfExtractort(uniquePath);

    // ← restored: original prompt + AI_model call unchanged
    const ResumePrompt = `You are an expert recruiter with extensive experience in evaluating candidates across various industries. 
        Your assessments are unbiased, thorough, and based solely on the provided job description, required keywords, and resume content. 
        Focus on matching skills, experience, education, achievements, cultural fit where applicable, and ATS compatibility.

        Job Description:
        ${jobDescription}  

        Required Keywords: ${keywords || 'None'} (Consider synonyms, variations, and related terms when matching, e.g., "React.js" matches "React" or "ReactJS". If no keywords provided, evaluate based on JD alone.)

        Resume Content:
        ${resumeText}

        Evaluation Guidelines:
        - Analyze the resume for relevance in: skills (technical or otherwise as per JD), professional experience (duration, roles, responsibilities), education/qualifications, projects/accomplishments, and any soft skills mentioned in the JD.
        - Evaluate ATS compatibility: Check for standard structure (e.g., clear section headings like 'Experience', 'Education', 'Skills'), use of bullet points for readability, chronological order in experience, absence of tables/graphics (infer from text patterns), standard fonts implied by plain text, no unusual characters or formatting that could break parsing. Penalize for poor structure, non-standard headings, or content that suggests incompatibility (e.g., mentions of images, complex layouts).
        - Be strict but fair: Penalize for gaps in core requirements or ATS issues, but credit transferable skills or equivalent experience.
        - Score calculation: 
        - 90-100: Exceptional match (meets all key requirements, exceeds in multiple areas, highly ATS compatible).
        - 80-89: Strong match (meets most requirements with minor gaps, good ATS compatibility).
        - 70-79: Good potential (meets core requirements but has some gaps or minor ATS issues; trainable).
        - 50-69: Moderate match (partial alignment; significant gaps or ATS concerns).
        - 0-49: Low/Poor match (Major mismatches, insufficient relevant experience, or severe ATS parsing risk)
        - Matched Keywords: List exact matches or close synonyms from the resume that align with required keywords or JD.
        - Reasons: Provide 3-5 concise, bullet-point-style explanations for the score, highlighting strengths, weaknesses, and ATS compatibility aspects.
        - Shortlist: "Yes" only if score >= ${slectedMinScore || '70'}, no critical red flags (e.g., unrelated experience, ethical issues, major ATS parsing risks). Otherwise, "No".
        - Suggested Improvements: Offer 2-4 actionable, specific recommendations to strengthen the resume for this role, including ATS optimizations (e.g., "Use standard headings like 'Professional Experience' instead of custom ones", "Quantify achievements with metrics like 'increased efficiency by 30%'").

        Respond with valid JSON only in this exact format:
        {
        "score": 0-100,
        "matchedKeywords": ["keyword1", "keyword2"],
        "reasons": ["Brief reason 1", "Brief reason 2", "Brief reason 3"],
        "shortlist": true or false (only boolean return as per "Yes" or "No"),
        "suggestedImprovements": ["Improvement 1", "Improvement 2"]
        }

        Rules:
        - Base evaluation purely on provided content; do not assume or infer unstated information.
        - Ensure JSON is parsable: Use double quotes, no trailing commas, arrays for lists.
        - Return ONLY the JSON object. No additional text, markdown, explanations, or code.`;

    const prompt = [
        { role: "system", content: "You must output ONLY valid JSON. Do NOT provide reasoning." },
        { role: 'user',   content: ResumePrompt }
    ];

    const result = await AI_model(prompt, githubModel, true); // ← restored: original AI_model call

    if (!result) {
      return { ...responseModel, reasons: 'AI evaluation failed' };
    }

    // ── PHASE 3: Short write queries ──────────────────────────────────────
    const savedId = await sequelize.transaction(async (t) => {
      const existing = await tenantQuery(
        tenant,
        `SELECT id FROM resume_vault_scans
         WHERE resume_volt_id = :resumeVaultID AND job_id = :jobId
         LIMIT 1`,
        { replacements: { resumeVaultID, jobId } },
        t
      );

      if (existing.length > 0) {
        await tenantQuery(
          tenant,
          `UPDATE resume_vault_scans
           SET scaning_data = :scaning_data, updated_at = :updated_at
           WHERE id = :id`,
          {
            replacements: {
              scaning_data: JSON.stringify(result),
              updated_at:   new Date(),
              id:           existing[0].id
            },
            returnMeta: true
          },
          t
        );
        return existing[0].id;
      } else {
        const insertResult = await tenantQuery(
          tenant,
          `INSERT INTO resume_vault_scans (resume_volt_id, job_id, scaning_data, created_at)
           VALUES (:resumeVaultID, :jobId, :scaning_data, :created_at)
           RETURNING id`,
          {
            replacements: {
              resumeVaultID, jobId,
              scaning_data: JSON.stringify(result),
              created_at:   new Date()
            }
          },
          t
        );
        return insertResult[0]?.id;
      }
    });
    // ── Transaction closed ─────────────────────────────────────────────────

    return {
      ...responseModel,
      id:                    savedId,
      ats:                   true,
      score:                 result.score,
      matchedKeywords:       result.matchedKeywords,
      reasons:               result.reasons               || [],
      suggestedImprovements: result.suggestedImprovements || [],
      shortlist:             result.shortlist
    };

  } catch (error) {
    console.error(`Failed for candidate ${resumeVaultID}:`, error.message);
    return null;
  } finally {
    await fs.remove(uniquePath).catch(() => {});
  }
}


