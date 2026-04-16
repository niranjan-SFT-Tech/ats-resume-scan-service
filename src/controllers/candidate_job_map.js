import { sequelize } from '../loaders/sequelize.js';  
import { tenantQuery } from '../utils/tenantQuery.js'; 

export default async (req, res) => {
    try {
        // ← changed: added req.tenant
        const { user, status, jobId, candidateIDs = [] } = req.body;
        const tenant = req.tenant;

        if (candidateIDs.length === 0) {
            return res.status(400).json({  
                success: false,
                message: 'No Candidate Found'
            });
        }

        const jobMapIDs = [];

        for (const candidate of candidateIDs) {
            // ← each candidate gets its own short transaction
            await sequelize.transaction(async (t) => {
                const jobMapID = await candidateWiseOparation(user, status, jobId, candidate, t, tenant);
                if (jobMapID) jobMapIDs.push(jobMapID);
            });
        }

        return res.status(200).json({
            success: true,
            mapIDs: jobMapIDs,
            resultMessage: `Successfully Candidate Mapped with Job Post`
        });

    } catch (err) {
        console.error('Error mapping candidates:', err.message);
        return res.status(500).json({
            success: false,
            resultMessage: 'Failed to map candidates',
            error: err.message
        });
    }
}; 
// ←  connection param replaced with transaction + tenant
export const candidateWiseOparation = async (user, status, jobId, candidateID, transaction = null, tenant = null) => {

    const run = async (t) => {

        // ←  tenantQuery instead of connection.execute, :name params instead of ?
        const existing = await tenantQuery(
            tenant,
            `SELECT id 
             FROM ta_candidate_job_post_map
             WHERE candidate_obj_id = :candidateID
               AND job_post_obj_id  = :jobId
             LIMIT 1`,
            { replacements: { candidateID, jobId } },
            t
        );

        if (existing.length > 0) {
            // ←  tenantQuery UPDATE, :name params, returnMeta: true
            await tenantQuery(
                tenant,
                `UPDATE ta_candidate_job_post_map
                 SET status                    = :status,
                     updated_at                = :updated_at,
                     shortlisted_reject_by_id  = :user
                 WHERE id                = :id
                   AND is_deleted        = false
                   AND candidate_obj_id  = :candidateID
                   AND job_post_obj_id   = :jobId`,
                {
                    replacements: {
                        status,
                        updated_at: new Date(),
                        user,
                        id:          existing[0].id,
                        candidateID,
                        jobId
                    },
                    returnMeta: true
                },
                t
            );
            return existing[0].id;

        } else {
            // ← changed: tenantQuery INSERT, RETURNING id instead of row.insertId
            const insertResult = await tenantQuery(
                tenant,
                `INSERT INTO ta_candidate_job_post_map
                    (status, candidate_obj_id, created_by_id, job_post_obj_id,
                     shortlisted_reject_by_id, updated_at, created_at, submit_date,
                     is_deleted, form_submitted,is_form_accepted)
                 VALUES
                    (:status, :candidateID, :user, :jobId,
                     :user, :updated_at, :created_at, :submit_date,
                     false, false,false)
                 RETURNING id`,
                {
                    replacements: {
                        status,
                        candidateID,
                        user,
                        jobId,
                        updated_at:  new Date(),
                        created_at:  new Date(),
                        submit_date: new Date()
                    }
                },
                t
            );
            // ← changed: RETURNING id instead of row.insertId
            return insertResult[0]?.id;
        }
    };

    // ← changed: reuse caller's transaction or create own
    if (transaction) {
        return run(transaction);
    }
    return sequelize.transaction(run);
};