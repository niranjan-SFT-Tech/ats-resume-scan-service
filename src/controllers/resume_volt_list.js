// import { promisePool } from '../loaders/mySQL.js';
import { tenantQuery } from '../utils/tenantQuery.js';
import { cleanResumeText } from '../utils/pdfExtract.js';
import textEmbedding, { searchPinecone, searchTextElaborated } from '../utils/text-embedding.js';
//
export default async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const pageSize = Math.max(1, parseInt(req.query.page_size) || 10);
  const offset = (page - 1) * pageSize;
  const resumeId = req.params.id; // Get resumeVoltId from URL parameters
  try {
    /* ---------------- SINGLE RECORD ---------------- */
    if(resumeId) {
      const resumeData = await tenantQuery(
        req.tenant,
        `SELECT
            rvur.*,
            cufum.file_link
          FROM resume_volt_uploaded_resumes AS rvur
          INNER JOIN core_uploaded_file_url_master AS cufum
            ON rvur.resume_id = cufum.id
          WHERE rvur.is_deleted = false
            AND rvur.id = :resumeId
        `,
        {
          replacements: { resumeId }
        }
      );
      if(resumeData.length) {
        return res.status(200).json({
          success: true,
          result: resumeData[0]
        });
      }
      return res.status(404).json({
        success: false, 
        resultMessage: 'Resume Volt not found for the given ID'
      });
    }
    ////-------------------------GET TOTAL DATA------------------------//////
    // Get TOTAL COUNT
    const countResult = await tenantQuery(
      req.tenant,
      `
      SELECT COUNT(*)::int AS total
      FROM resume_volt_uploaded_resumes AS rvur
      INNER JOIN core_uploaded_file_url_master AS cufum
        ON rvur.resume_id = cufum.id
      WHERE rvur.is_deleted = false
      `
    );
    const totalRecords = countResult[0].total || 0;
    const totalPages = Math.ceil(totalRecords / pageSize);
    // Get paginated data - USE ARRAY for parameters
    const rows = await tenantQuery(
      req.tenant,
      `
      SELECT
        rvur.*,
        cufum.file_link
      FROM resume_volt_uploaded_resumes AS rvur
      INNER JOIN core_uploaded_file_url_master AS cufum
        ON rvur.resume_id = cufum.id
      WHERE rvur.is_deleted = false
      ORDER BY rvur.id DESC
      LIMIT :limit OFFSET :offset
      `,
      {
        replacements: {
          limit: pageSize,
          offset: offset
        }
      }
    );
    // Helper function to build URL
    const buildUrl = (pageNum) => {      
      return req.protocol+'://'+req.get('host')+req.originalUrl.split('?')[0]+`?page=${pageNum}&page_size=${pageSize}`;
    };
    return res.status(200).json({
      success: true,
      pagination: {
        currentPage: page,
        pageSize: pageSize,
        totalRecords: totalRecords,
        totalPages: totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      },
      count: rows.length,
      results: rows,
      nextURL: page < totalPages ? buildUrl(page + 1) : null,
      prevURL: page > 1 ? buildUrl(page - 1) : null
    });

  } catch (err) {
    console.error('Error fetching resume volt list:', err.message);
    console.error('Stack:', err.stack);
    return res.status(500).json({
      success: false,
      resultMessage: 'Failed to fetch Resume Volt List',
      error: err.message
    });
  }
};
//
export const searchResumeVolt = async (req, res) => {
  try {  
    const {search, min_score}=req.query;
    const THRESHOLD = Number(min_score) || 0.05;     
    if(!search || search.trim() === ''){
      return res.status(400).json({
        success: false,
        resultMessage: 'Search query is required'
      })
    }
    const cleanedSearch = await cleanResumeText(search);
    const textExtended=await searchTextElaborated(cleanedSearch);       
    const stored_embedding =await textEmbedding(textExtended);  
    console.log(stored_embedding,"stored_embedding");
    
    //vector DB Search          
    const searchResult=await searchPinecone(stored_embedding, {topK:100, includeMetadata:true, includeValues:false});  
    console.log(searchResult,"--searchResult");
    
    const filteredMatches = searchResult.filter(match => match.score >= THRESHOLD);     
    const resumeVoltIds=filteredMatches.map(item=>Number(item.id)).filter(id => !isNaN(id) && id > 0);  
    console.log(resumeVoltIds,"resumeVoltIds");
        
    // Check if we have any IDs
    if (resumeVoltIds.length === 0) {
      return res.status(200).json({
        success: true,
        results: [],
        resultMessage: 'No matching resumes found'
      });
    }
    console.log(req.tenant,"tenant");
    const resumeData = await tenantQuery(
      req.tenant,
      `
        SELECT
          rvur.*,
          cufum.file_link
        FROM
          resume_volt_uploaded_resumes AS rvur
        INNER JOIN
          core_uploaded_file_url_master AS cufum
            ON rvur.resume_id = cufum.id
        WHERE
          rvur.is_deleted = false
          AND rvur.id = ANY(ARRAY[:ids])
        ORDER BY
          array_position(ARRAY[:ids]::int[], rvur.id)
      `,
      {
        replacements: { ids: resumeVoltIds }
      }
    );
    console.log(resumeData,"resumeData");
    
    const finalResults = resumeData.map(dbItem => {
      const match = filteredMatches.find(m => Number(m.id) === dbItem.id);
      return {
        ...dbItem,
        match_score: match ? (match.score * 100).toFixed(2) + '%' : '0%'
      };
    });
    return res.status(200).json({
      success: true,
      count: resumeData.length,
      thresholdUsed: THRESHOLD,
      results: finalResults,
      embeddedSerch:stored_embedding 
    })    
  } catch (err) {
      return res.status(500).json({
        success: false,
        resultMessage: 'Failed to search Resume Volt',
        error: err.message
      })
  }
}
//
export const searchResumeVoltByJobPost = async (req, res) => {
  try {
    const {jobDes, min_score, keySkill, jobTitle, searchType='Top Resume', jobID, searchText=null, topK=100}=req.body;
    const THRESHOLD = Number(min_score) || 0.30;
    try{
      //exist email ids againt job post map
      // const [emails] = await promisePool.query(
      //   `SELECT email
      //   FROM ta_candidate_basic_detail
      //   WHERE id IN (
      //       SELECT candidate_obj_id
      //       FROM ta_candidate_job_post_map
      //       WHERE job_post_obj_id = ?
      //   )`,
      //   [jobID]
      // ); 
      const emails=await tenantQuery(
        req.tenant,
        `SELECT email
          FROM ta_candidate_basic_detail
        WHERE id IN (
              SELECT candidate_obj_id
              FROM ta_candidate_job_post_map
              WHERE job_post_obj_id = :jobID
        )`,
        {
          replacements: { jobID }
        }
      );
      // console.log(emails,"--emails")
      const emailIDs = emails.map(item => item.email);      
      ///////////////////////////////////////Category FOR ALL RESUME/////////////////////////////////////////////////
      // if(searchType==='All Resume'){ 
      //   //Search resume volt
      //   if(searchText && searchText.trim() !== ''){
      //     const [searchData] = await promisePool.query(
      //       `SELECT
      //           rvur.*,
      //           cufum.file_link
      //       FROM resume_volt_uploaded_resumes AS rvur
      //       INNER JOIN core_uploaded_file_url_master AS cufum
      //           ON rvur.resume_id = cufum.id
      //       WHERE rvur.is_deleted = 0
      //         AND rvur.email NOT IN (?)
      //         AND (
      //           rvur.email LIKE ? 
      //           OR rvur.candidate_full_name LIKE ?
      //           OR rvur.phone_no LIKE ?
      //         )`,
      //       [emailIDs.length ? emailIDs :'', `%${searchText}%`, `%${searchText}%`, `%${searchText}%`]  
      //     );           
      //     return res.status(200).json({
      //       success: true,
      //       count: searchData.length,
      //       results: searchData
      //     }) 
      //   }  
      //   //All resume volt     
      //   const [resumeDataList] = await promisePool.query(
      //     `SELECT
      //         rvur.*,
      //         cufum.file_link
      //     FROM resume_volt_uploaded_resumes AS rvur
      //     INNER JOIN core_uploaded_file_url_master AS cufum
      //         ON rvur.resume_id = cufum.id
      //     WHERE rvur.is_deleted = 0
      //       AND rvur.email NOT IN (?)
      //       `,
      //     [emailIDs.length ? emailIDs :'']  
      //   );   
      //   return res.status(200).json({
      //     success: true,
      //     count: resumeDataList.length,
      //     results: resumeDataList
      //   }) 
      // }
      //////////////////////////////////////////Category FOR TOP RESUME///////////////////////////////////////////
      const cleanedSearch = await cleanResumeText(jobDes);
      const textExtended= !jobDes || jobDes.trim() === '' ? await searchTextElaborated('Job profile for : '+jobTitle) : cleanedSearch ;
      const stored_embedding =await textEmbedding(`${keySkill}, \n ${textExtended}`);  
      //vector DB Search     
      const searchResult=await searchPinecone(stored_embedding, {topK:topK, includeMetadata:false, includeValues:false});  
      const filteredMatches = searchResult.filter(match => match.score >= THRESHOLD);     
      const resumeVoltIds=filteredMatches.map(item=>Number(item.id)).filter(id => !isNaN(id) && id > 0);      
      // console.log(resumeVoltIds,"---resumeVoltIds")
      // Check if we have any IDs
      if (resumeVoltIds.length === 0) {
        return res.status(200).json({
          success: true,
          results: [],
          resultMessage: 'No matching resumes found'
        });
      }
      // const [resumeData] = await promisePool.query(
      //   `SELECT
      //       rvur.*,
      //       cufum.file_link
      //   FROM
      //       resume_volt_uploaded_resumes AS rvur
      //   INNER JOIN
      //       core_uploaded_file_url_master AS cufum
      //       ON rvur.resume_id = cufum.id
      //   WHERE
      //       rvur.is_deleted = 0
      //       AND rvur.id IN (?)
      //       AND rvur.email NOT IN (?)
      //   ORDER BY FIELD(rvur.id, ?)
      //   `,
      //   [resumeVoltIds, emailIDs.length ? emailIDs :'', resumeVoltIds]
      // );
      const resumeData= await tenantQuery(
        req.tenant,
        // `SELECT
        //     rvur.*,
        //     cufum.file_link
        // FROM
        //     resume_volt_uploaded_resumes AS rvur
        // INNER JOIN
        //     core_uploaded_file_url_master AS cufum
        //     ON rvur.resume_id = cufum.id
        // WHERE
        //     rvur.is_deleted = false
        //     AND rvur.id = ARRAY(:ids)
        //     AND rvur.email NOT IN (:emailIDs) 
        // ORDER BY array_position(ARRAY[:ids]::int[], rvur.id)
        // `,
        `
        SELECT
            rvur.*,
            cufum.file_link
        FROM
            sft.resume_volt_uploaded_resumes AS rvur
        INNER JOIN
            sft.core_uploaded_file_url_master AS cufum
                ON rvur.resume_id = cufum.id
        WHERE
            rvur.is_deleted = false
            AND rvur.id = ANY (ARRAY[:ids])
            AND NOT (rvur.email = ANY (ARRAY[:emailIDs]))
        ORDER BY
            array_position(ARRAY[:ids], rvur.id);

        `,
        {
          replacements: {
            ids: resumeVoltIds,
            emailIDs: emailIDs.length ? emailIDs : ['']
          }
        }
      );
      // console.log(resumeData,"--resumeData");
      const finalResults = resumeData.map(dbItem => {
        const match = filteredMatches.find(m => Number(m.id) === dbItem.id);
        return {
          ...dbItem,
          match_score: match ? (match.score * 100).toFixed(2) + '%' : '0%'
        };
      });
      return res.status(200).json({
        success: true,
        count: resumeData.length,
        thresholdUsed: THRESHOLD,
        results: finalResults
      })
    }catch (err) {
      throw err;
    }    
  } catch (err) {
      return res.status(500).json({
        success: false,
        resultMessage: 'Failed to search Resume Volt',
        error: err.message
      })
  }
}
//
export const resumeVoltListSearchByJobPost = async (req, res) => {
  try {
    const {jobID, searchText=null}=req.query;    
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.max(1, parseInt(req.query.page_size) || 10);
    const offset = (page - 1) * pageSize;
    try{      
      //exist email ids againt job post map
      // const [emails] = await promisePool.query(
      //   `SELECT email
      //   FROM ta_candidate_basic_detail
      //   WHERE id IN (
      //       SELECT candidate_obj_id
      //       FROM ta_candidate_job_post_map
      //       WHERE job_post_obj_id = ?
      //   )`,
      //   [jobID]
      // ); 
      const emails=await tenantQuery(
        req.tenant,
        `SELECT email
        FROM ta_candidate_basic_detail
        WHERE id IN (
            SELECT candidate_obj_id
            FROM ta_candidate_job_post_map
            WHERE job_post_obj_id = :jobID
        )`,
        {
          replacements: { jobID }
        }
      );
      const emailIDs = emails.map(item => item.email);          
      //Search resume volt=================================================
      if(searchText && searchText.trim() !== ''){
        const searchData = await tenantQuery(
          req.tenant,
          `
            SELECT
              rvur.*,
              cufum.file_link
            FROM resume_volt_uploaded_resumes AS rvur
            INNER JOIN core_uploaded_file_url_master AS cufum
              ON rvur.resume_id = cufum.id
            WHERE rvur.is_deleted = false
              AND rvur.email NOT IN (:emailIDs)
              AND (
                rvur.email LIKE :searchText
                OR rvur.candidate_full_name LIKE :searchText
                OR rvur.phone_no LIKE :searchText
              )
          `,
          {
            replacements: {
              emailIDs: emailIDs.length ? emailIDs : [''],
              searchText: `%${searchText}%`
            }
          }
        );           
        return res.status(200).json({
          success: true,
          count: searchData.length,
          results: searchData
        }) 
      } 
      //All resume volt===================================================       
      //// Get total count

      // const [countResult] = await promisePool.execute(
      //   `SELECT COUNT(*) as total 
      //   FROM resume_volt_uploaded_resumes AS rvur
      //   INNER JOIN core_uploaded_file_url_master AS cufum
      //     ON rvur.resume_id = cufum.id
      //   WHERE rvur.is_deleted = 0 
      //   AND rvur.email NOT IN (?)`,
      //   [emailIDs.length ? emailIDs :'']
      // );

      const countResult= await tenantQuery(
        req.tenant,
        `SELECT COUNT(*) as total 
        FROM resume_volt_uploaded_resumes AS rvur
        INNER JOIN core_uploaded_file_url_master AS cufum
          ON rvur.resume_id = cufum.id
        WHERE rvur.is_deleted = false 
        AND rvur.email NOT IN (:emailIDs)`,
        {
          replacements: {
            emailIDs: emailIDs.length ? emailIDs : ['']
          }
        }
      );

      const totalRecords = countResult[0].total;
      const totalPages = Math.ceil(totalRecords / pageSize);
      const buildUrl = (pageNum) => {      
        return req.protocol+'://'+req.get('host')+req.originalUrl.split('?')[0]+`?page=${pageNum}&page_size=${pageSize}`;
      };      
      // const [resumeDataList] = await promisePool.query(
      //   `SELECT
      //       rvur.*,
      //       cufum.file_link
      //   FROM resume_volt_uploaded_resumes AS rvur
      //   INNER JOIN core_uploaded_file_url_master AS cufum
      //       ON rvur.resume_id = cufum.id
      //   WHERE rvur.is_deleted = 0
      //     AND rvur.email NOT IN (?)
      //   ORDER BY rvur.id DESC
      //     LIMIT ? OFFSET ?`,
      //   [emailIDs.length ? emailIDs :'', pageSize, offset]  
      // );  
      
      const resumeDataList = await tenantQuery(
        req.tenant,
        `SELECT
            rvur.*,
            cufum.file_link
        FROM resume_volt_uploaded_resumes AS rvur
        INNER JOIN core_uploaded_file_url_master AS cufum
            ON rvur.resume_id = cufum.id
        WHERE rvur.is_deleted = false
          AND rvur.email NOT IN (:emailIDs)
        ORDER BY rvur.id DESC
          LIMIT :limit OFFSET :offset`,
        {
          replacements: {
            emailIDs: emailIDs.length ? emailIDs : [''],
            limit: pageSize,
            offset: offset
          }
        }
      );

      return res.status(200).json({ 
        success: true,
        pagination: {
          currentPage: page,
          pageSize: pageSize,
          totalRecords: totalRecords,
          totalPages: totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1
        },
        count: resumeDataList.length,
        results: resumeDataList,
        nextURL: page < totalPages ? buildUrl(page + 1) : null,
        prevURL: page > 1 ? buildUrl(page - 1) : null
      })
    }catch (err) {
      throw err;
    }    
  } catch (err) {
      return res.status(500).json({
        success: false,
        resultMessage: 'Failed to search Resume Volt',
        error: err.message
      })
  }
}
//
export const getCountResumeVolt = async (req, res) => {
  try {
    // const [countResult] = await promisePool.execute(
    //   `SELECT COUNT(*) as total 
    //    FROM resume_volt_uploaded_resumes AS rvur
    //    INNER JOIN core_uploaded_file_url_master AS cufum
    //      ON rvur.resume_id = cufum.id
    //    WHERE rvur.is_deleted = 0`
    // );
    const countResult = await tenantQuery(
      req.tenant,
      `
        SELECT COUNT(*) AS total
        FROM resume_volt_uploaded_resumes AS rvur
        INNER JOIN core_uploaded_file_url_master AS cufum
          ON rvur.resume_id = cufum.id
        WHERE rvur.is_deleted = false
      `
    );
    const totalRecords = countResult[0].total;
    return res.status(200).json({
      success: true,
      count: totalRecords
    })
  } catch (err) {
      return res.status(500).json({
        success: false,
        resultMessage: 'Failed to search Resume Volt',
        error: err.message
      })
  }
}