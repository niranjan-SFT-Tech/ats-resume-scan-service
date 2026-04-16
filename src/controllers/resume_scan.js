import { sequelize } from '../loaders/sequelize.js'; // ← changed: removed promisePool
import OpenAI from 'openai';
import { githubToken, githubModel } from '../configs/index.js';
import { githubModelsArray, githubBaseURI } from '../utils/githubAI_model.js';
import fs from 'fs-extra';
import path from 'path';
import { PDFParse } from 'pdf-parse';
import http from 'http';
import https from 'https';
import { candidateWiseOparation } from '../controllers/candidate_job_map.js';
import { tenantQuery } from '../utils/tenantQuery.js'; // ← changed: added tenantQuery

const client = new OpenAI({
  apiKey: githubToken,
  baseURL: githubBaseURI,
});

let MODEL = githubModel;

const TEMP_DIR = './temp';
await fs.ensureDir(TEMP_DIR);

export default async (req, res) => {
  try {
    // ← changed: added req.tenant
    const { userID, job_id, job_title, job_des, candidateIds = [], keywords = [], isAutoShortlist } = req.body;
    const tenant = req.tenant;

    if (candidateIds.length === 0) {
      return res.status(400).json({ success: false, message: 'No candidates provided' });
    }
    if (!job_id || !job_des || !job_des.trim().length || !keywords.length) {
      return res.status(400).json({
        success: false,
        message: `${!job_id ? 'Job ID is missing' : !job_des || !job_des.trim().length ? 'Job Description is missing' : 'Keywords are missing'}`
      });
    }
    if (candidateIds.length > 100) {
      return res.status(400).json({
        success: false,
        message: 'Batch too large (max 100 for free tier rate limits)'
      });
    }

    const results = [];

    for (const candidateId of candidateIds) {
      try {
        // ← changed: pass tenant, no transaction here — createScanTask manages its own
        const task = await createScanTask(candidateId, job_id, job_des, keywords, tenant);
        // console.log(task,"TASK----")
        if (isAutoShortlist && task?.shortlist) {
          // ← changed: candidateWiseOparation now receives tenant + transaction
          await sequelize.transaction(async (t) => {
            const candidateMapId = await candidateWiseOparation(
              userID, 'Shortlisted', job_id, candidateId, t, tenant
            );
            if (candidateMapId) {
              Object.assign(task, {
                autoShort: true,
                jobMapID: candidateMapId
              });
            }
          });
        }

        if (task) results.push(task);

        // ****IMPORTANT NOTE : Safe delay for free tier - remove or adjust for paid plans with higher rate limits. This is a simple throttle to avoid hitting API limits when processing batches.
        await new Promise(resolve => setTimeout(resolve, 7000));

      } catch (err) {
        console.error(`Error processing candidate ${candidateId}:`, err.message);
      }
    }

    return res.status(200).json({
      success: true,
      count: results.length,
      shortlist_count: results.filter(x => x.shortlist)?.length || 0,
      ats_failed_count: results.filter(x => !x.ats)?.length || 0,
      rejected_count: results.filter(x => !x.shortlist)?.length || 0,
      results
    });

  } catch (err) {
    console.error('Unexpected error:', err);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: err.message,
    });
  }
};

// ← changed: added tenant param, split into 3 phases — no transaction held during AI/download
async function createScanTask(candidateId, jobId, jobDescription, keywords, tenant) {
  const uniquePath = path.join(TEMP_DIR, `resume_${candidateId}_${Date.now()}.pdf`);

  try {
    let responseModel = {
      candidateId,
      jobId,
      score: 0,
      matchedKeywords: [],
      suggestedImprovements: [],
      shortlist: false,
      reasons: null,
      ats: false,
      autoShort: false
    };

    // ── PHASE 1: Read queries — short transaction ─────────────────────────
    // ← changed: sequelize.transaction + tenantQuery instead of promisePool.execute
    const { candidateRow, candidateINscna } = await sequelize.transaction(async (t) => {

      // ← changed: tenantQuery, :name params instead of ?
      const candidateDetails = await tenantQuery(
        tenant,
        `SELECT 
          tcbd.candidate_resume_id,
          tcbd.email,
          tcbd.first_name,
          tcbd.last_name,
          tcbd.middle_name,
          tcbd.dob,
          tcbd.phone_number,
          cufum_resume.file_link AS resume_file_link,
          cufum_photo.file_link  AS profile_pic_link
         FROM ta_candidate_basic_detail AS tcbd
         LEFT JOIN core_uploaded_file_url_master AS cufum_resume
           ON cufum_resume.id = tcbd.candidate_resume_id
         LEFT JOIN core_uploaded_file_url_master AS cufum_photo
           ON cufum_photo.id = tcbd.candidate_img_id
         WHERE tcbd.id = :candidateId`,
        { replacements: { candidateId } },
        t
      );

      if (!candidateDetails.length) return { candidateRow: null, candidateINscna: null };

      const candidateRow = candidateDetails[0];

      // ← changed: tenantQuery, :name params
      const scanTableData = await tenantQuery(
        tenant,
        `SELECT * 
         FROM ta_resume_scan
         WHERE candidate_id = :candidateId
           AND resume_id    = :resumeId
           AND job_id       = :jobId`,
        { replacements: { candidateId, resumeId: candidateRow.candidate_resume_id, jobId } },
        t
      );

      const candidateINscna = scanTableData?.length ? scanTableData[0] : null;

      return { candidateRow, candidateINscna };
    });
    // ── Transaction closed — connection returned to pool ──────────────────

    if (!candidateRow) {
      return { ...responseModel, reasons: 'Candidate not found' };
    }

    responseModel = { ...responseModel, ...candidateRow };

    if (!candidateRow.resume_file_link) {
      return { ...responseModel, reasons: 'Candidate resume not found' };
    }

    const fileExt = path.extname(candidateRow.resume_file_link).toLowerCase();
    if (fileExt !== '.pdf') {
      return {
        ...responseModel,
        reasons: `Only PDF files are allowed for ATS. Found: ${fileExt}`,
        suggestedImprovements: [
          'Please upload a valid PDF file that is ATS-compatible',
          'Please tailor your resume to match the job description'
        ]
      };
    }

    // Return cached scan — no AI needed
    if (candidateINscna) {
      return {
        ...responseModel,
        score:                candidateINscna.scaning_data.score              || 0,
        matchedKeywords:      candidateINscna.scaning_data.matchedKeywords    || [],
        suggestedImprovements:candidateINscna.scaning_data.suggestedImprovements || [],
        shortlist:            candidateINscna.scaning_data.shortlist,
        reasons:              candidateINscna.scaning_data.reasons,
        ats: true,
      };
    }

    // ── PHASE 2: Heavy async — NO transaction held ────────────────────────
    // ← changed: download + AI outside transaction
    await downloadFile(candidateRow.resume_file_link, uniquePath);
    const resumeText = await extractTextFromPdf(uniquePath);
    const truncatedResume = resumeText.substring(0, 10000);
    const result = await evaluateWithRetry(truncatedResume, jobDescription, keywords.join(', '));

    if (!result) {
      return { ...responseModel, reasons: 'AI evaluation failed' };
    }

    // ── PHASE 3: Write queries — short transaction ────────────────────────
    // ← changed: sequelize.transaction + tenantQuery for upsert
    const savedId = await sequelize.transaction(async (t) => {

      // ← changed: tenantQuery, :name params
      const existing = await tenantQuery(
        tenant,
        `SELECT id FROM ta_resume_scan
         WHERE candidate_id = :candidateId AND job_id = :jobId
         LIMIT 1`,
        { replacements: { candidateId, jobId } },
        t
      );

      if (existing.length > 0) {
        // ← changed: tenantQuery UPDATE, :name params, returnMeta: true
        await tenantQuery(
          tenant,
          `UPDATE ta_resume_scan
           SET scaning_data = :scaning_data,
               resume_id    = :resumeId
           WHERE id           = :id
             AND candidate_id = :candidateId
             AND job_id       = :jobId`,
          {
            replacements: {
              scaning_data: JSON.stringify(result),
              resumeId:     candidateRow.candidate_resume_id,
              id:           existing[0].id,
              candidateId,
              jobId
            },
            returnMeta: true
          },
          t
        );
        return existing[0].id;
      } else {
        // ← changed: tenantQuery INSERT, RETURNING id instead of insertId
        const insertResult = await tenantQuery(
          tenant,
          `INSERT INTO ta_resume_scan
            (candidate_id, resume_id, job_id, scaning_data, created_at)
           VALUES
            (:candidateId, :resumeId, :jobId, :scaning_data, :created_at)
           RETURNING id`,
          {
            replacements: {
              candidateId,
              resumeId:     candidateRow.candidate_resume_id,
              jobId,
              scaning_data: JSON.stringify(result),
              created_at:   new Date()
            }
          },
          t
        );
        return insertResult[0]?.id;
      }
    });
    // ── Transaction closed ────────────────────────────────────────────────

    return {
      ...responseModel,
      id:                   savedId,
      ats:                  true,
      score:                result.score,
      matchedKeywords:      result.matchedKeywords,
      reasons:              result.reasons              || [],
      suggestedImprovements:result.suggestedImprovements || [],
      shortlist:            result.shortlist
    };

  } catch (error) {
    console.error(`Failed for candidate ${candidateId}:`, error.message);
    await fs.remove(uniquePath).catch(() => {});
    return null;
  } finally {
    await fs.remove(uniquePath).catch(() => {});
  }
}

// unchanged — AI retry logic stays the same
async function evaluateWithRetry(resumeText, jobDescription, keywordsStr) {
  const prompt = `You are an expert recruiter with extensive experience in evaluating candidates across various industries. 
    Your assessments are unbiased, thorough, and based solely on the provided job description, required keywords, and resume content. 
    Focus on matching skills, experience, education, achievements, cultural fit where applicable, and ATS compatibility.

    Job Description:
    ${jobDescription}  

    Required Keywords: ${keywordsStr || 'None'} (Consider synonyms, variations, and related terms when matching, e.g., "React.js" matches "React" or "ReactJS". If no keywords provided, evaluate based on JD alone.)

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
    - Shortlist: "Yes" only if score >= 70, no critical red flags (e.g., unrelated experience, ethical issues, major ATS parsing risks). Otherwise, "No".
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

  let attempts = 0;
  const maxAttempts = 6;

  while (attempts < maxAttempts) {
    try {
      console.log(`Using Model- ${MODEL}`);
      const response = await client.chat.completions.create({
        model: MODEL,
        messages: [
          { role: "system", content: "You must output ONLY valid JSON. Do NOT provide reasoning." },
          { role: 'user', content: prompt }
        ],
        max_tokens: 400,
        temperature: 0.7,
        response_format: { type: "json_object" },
      });

      console.log('uses token count----\n', response.usage);
      const msg = response.choices?.[0]?.message?.content;

      if (!msg) {
        const err = new Error(`Empty response from ${MODEL} model`);
        err.status = 429;
        throw err;
      }

      let rawContent = msg.trim() || '';
      if (!isValidJSON(rawContent)) {
        const err = new Error(MODEL + ' Model returned invalid JSON');
        err.status = 429;
        throw err;
      }

      const result = JSON.parse(rawContent);
      if (
        typeof result.score === 'number' &&
        result.score >= 0 && result.score <= 100 &&
        Array.isArray(result.matchedKeywords) &&
        Array.isArray(result.reasons) &&
        [true, false].includes(result.shortlist) &&
        Array.isArray(result.suggestedImprovements)
      ) {
        return result;
      }

      const err = new Error(`Output Invalid JSON structure from ${MODEL} model`);
      err.status = 429;
      throw err;

    } catch (error) {
      if (error.status === 429 || (error.message && error.message.includes('429'))) {
        attempts++;
        MODEL = githubModelsArray[attempts % githubModelsArray.length];
        const delay = Math.pow(2, attempts) * 2000;
        console.warn(`Rate limited. Retrying in ${delay / 1000}s... (${attempts}/${maxAttempts})`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        console.error('AI evaluation error:', error.message || error);
        break;
      }
    }
  }

  return null;
}

// unchanged
async function downloadFile(url, localPath) {
  await fs.ensureDir(path.dirname(localPath));
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(localPath);
    const mod = url.startsWith('https') ? https : http;
    mod.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: HTTP ${response.statusCode}`));
        return;
      }
      response.pipe(file);
      file.on('finish', () => file.close(() => resolve(localPath)));
      file.on('error', reject);
    }).on('error', reject);
  });
}

// unchanged
async function extractTextFromPdf(filePath) {
  const dataBuffer = await fs.readFile(filePath);
  const parser = new PDFParse({ data: dataBuffer });
  const data = await parser.getText();
  return data.text;
}

// unchanged
function isValidJSON(data) {
  if (typeof data !== "string" || !data.trim()) return false;
  data = data.replace(/```json|```/g, "").trim();
  const start = data.indexOf("{");
  const end = data.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return false;
  const jsonText = data.slice(start, end + 1);
  try {
    JSON.parse(jsonText);
    return true;
  } catch {
    return false;
  }
}