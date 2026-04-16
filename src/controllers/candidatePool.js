import { tenantQuery } from '../utils/tenantQuery.js'; // ← changed: removed promisePool, added tenantQuery

export default async (req, res) => {
  const jobID  = req.query.job_id;
  const tenant = req.tenant;  
  // const page = parseInt(req.query.page) || 1;
  // const pageSize = parseInt(req.query.page_size) || 10; // Default page size
  // const offset = (page - 1) * pageSize;
  console.log(jobID,"jobID")
  try {
    const rows = await tenantQuery(
      tenant,
      `SELECT
          tcbd.*,
          agg.job_post_ids,
          cufum_resume.file_link AS resume_file_link,
          cufum_photo.file_link  AS profile_pic_link
      FROM ta_candidate_basic_detail AS tcbd
      LEFT JOIN (
          SELECT
              candidate_obj_id,
              STRING_AGG(DISTINCT job_post_obj_id::text, ',') AS job_post_ids
          FROM ta_candidate_job_post_map
            WHERE status NOT IN ('Onboarding')
            GROUP BY candidate_obj_id
      ) AS agg ON tcbd.id = agg.candidate_obj_id
      LEFT JOIN core_uploaded_file_url_master AS cufum_resume
          ON tcbd.candidate_resume_id = cufum_resume.id
      LEFT JOIN core_uploaded_file_url_master AS cufum_photo
          ON tcbd.candidate_img_id = cufum_photo.id
      WHERE tcbd.id NOT IN (
          SELECT candidate_obj_id
            FROM ta_candidate_job_post_map
            WHERE job_post_obj_id = :jobID
      )`,
      { replacements: { jobID } }
    );
    return res.status(200).json({
      success: true,
      count: rows.length,
      results: rows
    });

  } catch (err) {
    console.error('Error fetching candidates:', err.message);
    return res.status(500).json({
      success: false,
      resultMessage: 'Failed to fetch candidates',
      error: err.message
    });
  }
};