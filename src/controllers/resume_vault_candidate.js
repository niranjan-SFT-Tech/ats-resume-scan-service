// import { promisePool, pool } from '../loaders/mySQL.js'; // ← Use promisePool
// import { candidateWiseOparation } from './candidate_job_map.js';

// export const resumeVaultToCandidateMap = async (createdByUser, candidateInfo, status, jobId, resumeVaultID, tenant=null, transaction=null)=>{
//     let ownConnection = false;
//     if(!transaction){
//         connection = await promisePool.getConnection(); 
//         await connection.beginTransaction(); 
//         ownConnection = true; 
//     }
//     let responseBack = {
//         isSaved:false,
//         errorMsg:null
//     }
//     try{ 
//         let candidateID; 
//         // Check exiting candidate with email in candidate list
//         const [existingCandidate] = await connection.execute(
//             `SELECT * 
//             FROM ta_candidate_basic_detail 
//                 WHERE email = ? AND is_deleted = 0
//                 LIMIT 1`,
//             [candidateInfo.email || '']
//         );            
//         if(existingCandidate.length > 0) {
//             candidateID = existingCandidate[0].id;
//         }else{
//             //insert new candidate 
//             const [candidateNew] = await connection.execute(
//                 `INSERT 
//                 INTO ta_candidate_basic_detail 
//                     (
//                         first_name,
//                         middle_name,
//                         last_name,
//                         email,                           
//                         phone_number,
//                         candidate_resume_id,
//                         created_by_id,
//                         created_at,
//                         updated_at,
//                         is_deleted,
//                         is_employee
//                     ) 
//                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,  //  10 placeholders
//                 [
//                     candidateInfo.candidate_first_name||'',   // first_name
//                     candidateInfo.candidate_middle_name||'',  // middle_name
//                     candidateInfo.candidate_last_name||'',    // last_name
//                     candidateInfo.email||'',                  // email
//                     candidateInfo.phone_no||'',               // phone_number
//                     candidateInfo.resume_id||'',              // candidate_resume_id
//                     createdByUser,                            // created_by_id
//                     new Date(),                               // created_at
//                     new Date(),                               // updated_at
//                     0,                                        // is_deleted
//                     0                                         // is_employee
//                 ]
//             );
//             candidateID = candidateNew.insertId; 
//         }         
//         //Map candidate with job   
//         const candidateJobMapId =await candidateWiseOparation(createdByUser, status, Number(jobId), candidateID, connection);         
//         //update resume vault with candidate job map id  
//         const [resumeVaultRow] = await connection.execute(
//             `UPDATE resume_volt_uploaded_resumes 
//                 SET job_map_Ids = JSON_ARRAY_APPEND(
//                         COALESCE(job_map_Ids, JSON_ARRAY()),
//                         '$',
//                         CAST(? AS UNSIGNED)
//                 )
//                 WHERE id = ?`,
//             [
//               candidateJobMapId,
//               resumeVaultID,
//             ]
//         ); 
//         /////////
//         if (ownConnection) await connection.commit();
//         return {
//             ...responseBack,
//             isSaved:true,
//             candidateJobMapId
//         }  
//     }catch(err){
//         console.error('Error inserting ', err.message);
//         if (ownConnection) await connection.rollback(); 
//         return {
//             ...responseBack,
//             errorMsg:err.message
//         }
//     } finally {
//         if (ownConnection) connection.release(); 
//     }  
// }

import { tenantQuery } from '../utils/tenantQuery.js';
import { sequelize } from '../loaders/sequelize.js';
import { candidateWiseOparation } from './candidate_job_map.js';

export const resumeVaultToCandidateMap = async (
  createdByUser, candidateInfo, status, jobId, resumeVaultID, tenant = null, transaction = null
) => {
  const responseBack = {
    isSaved: false,
    errorMsg: null
  };

  try {
    const run = async (t) => {
      let candidateID;

      // ── Check existing candidate by email ───────────────────────────────
      const existingCandidate = await tenantQuery(
        tenant,
        `SELECT id 
         FROM ta_candidate_basic_detail 
         WHERE email = :email 
         AND is_deleted = false
         LIMIT 1`,
        { replacements: { email: candidateInfo.email || '' } },
        t
      );
      // console.log(existingCandidate,"existingCandidate")
      if (existingCandidate.length > 0) {
        candidateID = existingCandidate[0].id;
      } else {
        // ── Insert new candidate ─────────────────────────────────────────
        const newCandidate = await tenantQuery(
          tenant,
          `INSERT INTO ta_candidate_basic_detail 
            (
              first_name,
              middle_name,
              last_name,
              email,
              phone_number,
              candidate_resume_id,
              created_by_id,
              created_at,
              updated_at,
              is_deleted,
              is_employee
            ) 
           VALUES 
            (
              :first_name,
              :middle_name,
              :last_name,
              :email,
              :phone_number,
              :candidate_resume_id,
              :created_by_id,
              :created_at,
              :updated_at,
              false,
              false
            )
           RETURNING id`,
          {
            replacements: {
              first_name:          candidateInfo.candidate_first_name  || '',
              middle_name:         candidateInfo.candidate_middle_name || '',
              last_name:           candidateInfo.candidate_last_name   || '',
              email:               candidateInfo.email                 || '',
              phone_number:        candidateInfo.phone_no              || '',
              candidate_resume_id: candidateInfo.resume_id             || '',
              created_by_id:       createdByUser,
              created_at:          new Date(),
              updated_at:          new Date(),
              // is_deleted:          false,
              // is_employee:         false
            }
          },
          t
        );
        candidateID = newCandidate[0]?.id;
      }

      // ── Map candidate with job ───────────────────────────────────────────
      const candidateJobMapId = await candidateWiseOparation(
        createdByUser, status, Number(jobId), candidateID, t, tenant
      );

      // ── Update resume vault with candidate job map id ────────────────────
      await tenantQuery(
        tenant,
        `UPDATE resume_volt_uploaded_resumes
         SET job_map_Ids = COALESCE(job_map_Ids, '[]'::jsonb) || jsonb_build_array(:candidateJobMapId::int)
         WHERE id = :resumeVaultID`,
        {
          replacements: { candidateJobMapId, resumeVaultID },
          returnMeta: true
        },
        t
      );

      return {
        ...responseBack,
        isSaved: true,
        candidateJobMapId
      };
    };

    // ── Reuse caller's transaction or create a new one ───────────────────
    if (transaction) {
      return await run(transaction);
    }
    return await sequelize.transaction(run);

  } catch (err) {
    console.error('resumeVaultToCandidateMap error:', err.message);
    return {
      ...responseBack,
      errorMsg: err.message
    };
  }
};