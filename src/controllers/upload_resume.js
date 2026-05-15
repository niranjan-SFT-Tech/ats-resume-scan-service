import { sequelize } from '../loaders/sequelize.js'; //  removed promisePool
import AI_model from '../utils/AI_model.js';
import { pdfExtractort, pdfFileDelete, extractCandidateInfo, cleanResumeText } from '../utils/pdfExtract.js';
import { filePathToHttpURL, getBaseURL } from '../utils/getFileIPAddres.js';
import textEmbedding, { saveToPinecone, updatePinecone, sortResumeWithAI } from '../utils/text-embedding.js';
import { resumeInfoExtracModel } from '../configs/index.js';
import { tenantQuery } from '../utils/tenantQuery.js'; //  added tenantQuery

// Get baseURL
let systemBaseURL;

// default upload
export default async (req, res) => {
    systemBaseURL = getBaseURL(req.protocol, req.get('host'));
    // console.log(systemBaseURL,"SYSTEM BASE URL")
    const { userId, is_AI = false } = req.body;
    try {
        const files = req.files;
        if (!files || files.length === 0) {
            return res.status(400).json({
                success: false,
                resultMessage: 'No files uploaded',
                error: 'No files uploaded'
            });
        }
        const processedFiles = [];
        const errors = [];
        for (const file of files) {
            console.log(file,"--file--");
            try {
                if (file.mimetype !== 'application/pdf') {
                    await pdfFileDelete(file.path);
                    errors.push(`${file.originalname}: Invalid file type. Only PDF allowed.`);
                    continue;
                }
                const maxSize = 5 * 1024 * 1024;
                if (file.size > maxSize) {
                    await pdfFileDelete(file.path);
                    errors.push(`${file.originalname}: File too large (max 5MB).`);
                    continue;
                }
                if (file.size < 1024) {
                    await pdfFileDelete(file.path);
                    errors.push(`${file.originalname}: File too small.`);
                    continue;
                }
                //  pass req.tenant for tenantQuery
                const uploadedResumeInfo = await saveToDatabase(file, userId, is_AI, req.tenant);
                if (!uploadedResumeInfo.isSaved) {
                    errors.push(`${uploadedResumeInfo.msg}`);
                    continue;
                } else {
                    processedFiles.push({
                        id: uploadedResumeInfo.resumeVoltID,
                        name: file.originalname,
                        url: filePathToHttpURL(systemBaseURL, file.path),
                        resumeID: uploadedResumeInfo.resumeFileID,
                        candidate_name: uploadedResumeInfo.candidate_name,
                        phone_number: uploadedResumeInfo.phone_number,
                        email: uploadedResumeInfo.email
                    });
                }
            } catch (fileError) {
                console.error(`Error processing ${file.originalname}:`, fileError);
                errors.push(`${file.originalname}: Processing failed.`);
            }
        }
        if (processedFiles.length === 0) {
            return res.status(400).json({
                success: false,
                resultMessage: `Resume upload failed. Please check the file content or ensure the email is not already registered, then try again.`,
                errors: errors
            });
        }
        const response = {
            success: true,
            resultMessage: `${processedFiles.length} resume(s) uploaded successfully`,
            totalFiles: files.length,
            successfulUploads: processedFiles.length,
            failedUploads: errors.length,
            result: {
                successfulUploadsFiles: processedFiles,
                failedUploadsFiles: errors
            }
        };
        if (errors.length > 0) {
            response.resultMessage += ` (${errors.length} file(s) failed)`;
        }
        return res.status(200).json(response);
    } catch (err) {
        console.error('Error upload resume:', err.message);
        return res.status(500).json({
            success: false,
            resultMessage: err.message || 'Failed to Upload Resume',
            error: err.message
        });
    }
};

// update resume volt
export const updateResumeVolt = async (req, res) => {
    const {
        userId,
        useAI,
        candidate_first_name = null,
        candidate_middle_name = null,
        candidate_last_name = null,
        candidate_full_name = null,
        email = null,
        phone_no = null
    } = req.body;
    systemBaseURL = getBaseURL(req.protocol, req.get('host'));
    const isAI = useAI == 'true' ? true : false;
    const resumeVoltId = req?.params?.id;
    try {
        const file = req?.files?.[0] ?? null;
        if (file && file.mimetype !== 'application/pdf') {
            await pdfFileDelete(file.path);
            return res.status(400).json({
                success: false,
                resultMessage: 'Invalid file type. Only PDF allowed.',
                error: 'Invalid file type. Only PDF allowed.'
            });
        }
        const maxSize = 5 * 1024 * 1024;
        if (file && file.size > maxSize) {
            await pdfFileDelete(file.path);
            return res.status(400).json({
                success: false,
                resultMessage: 'File too large (max 5MB).',
                error: 'File too large (max 5MB).'
            });
        }
        if (file && file.size < 1024) {
            await pdfFileDelete(file.path);
            return res.status(400).json({
                success: false,
                resultMessage: 'File too small.',
                error: 'File too small.'
            });
        }
        if (!candidate_first_name || !candidate_last_name || !candidate_full_name || !email || !phone_no) {
            const err = `${candidate_first_name ? '' : 'Candidate First Name is missing,'} ${candidate_last_name ? '' : 'Candidate Last Name is missing,'}
                ${candidate_full_name ? '' : 'Candidate Full Name is missing,'}
                ${email ? '' : 'Candidate Email is missing,'} ${phone_no ? '' : 'Candidate Phone Number is missing'}`;
            return res.status(400).json({
                success: false,
                resultMessage: err,
                error: err
            });
        }
        const canInfoData = {
            candidate_first_name,
            candidate_middle_name: candidate_middle_name && candidate_middle_name != '' ? candidate_middle_name : null,
            candidate_last_name,
            candidate_full_name,
            phone_number: phone_no,
            email,
            resumeVoltID: resumeVoltId
        };
        //  pass req.tenant for tenantQuery
        const uploadedResumeInfo = await updateToDatabase(file, userId, canInfoData, isAI, req.tenant);
        if (uploadedResumeInfo.isSaved) {
            return res.status(200).json({
                success: true,
                resultMessage: 'Updated Resume Volt',
                result: uploadedResumeInfo
            });
        } else {
            return res.status(409).json({
                success: false,
                resultMessage: uploadedResumeInfo.msg,
                result: null
            });
        }
    } catch (err) {
        console.error('Error upload resume:', err.message);
        return res.status(500).json({
            success: false,
            resultMessage: err.message || 'Failed to Update Resume Volt',
            error: err.message
        });
    }
};

// helper ======================================================================
//  added tenant param, removed promisePool, use sequelize.transaction + tenantQuery
async function saveToDatabase(file, userId, is_AI, tenant) {
    const responseBack = {
        isSaved: false,
        msg: '',
        resumeFileID: null,
        resumeVoltID: null,
        candidate_name: null,
        phone_number: null,
        email: null
    };

    try {
        const pdfData = await pdfExtractort(file.path);
        // console.log(pdfData,"--pdfdata--");
        
        if (!pdfData) {
            await pdfFileDelete(file.path);
            return { ...responseBack, msg: `${file.originalname}: Not valid file` };
        }

        const cleanedText = await cleanResumeText(pdfData);

        // ── PHASE 1: Heavy async work — NO transaction held ───────────────
        //  AI/embedding done BEFORE opening transaction
        const [textEmbeddingVector, cvDetails] = await Promise.all([
            (async () => {
                if (is_AI == 'true' || is_AI === true) {
                    const sortResumeText = await sortResumeWithAI(cleanedText);
                    console.log(sortResumeText,"--sortResumeText--");
                    return await textEmbedding(sortResumeText);
                }
                return null;
            })(),
            (async () => {
                if (is_AI == 'true' || is_AI === true) {
                    const content = `
                        You are an expert resume validator and information extractor.
                        First, determine if this document is a valid resume/CV. Then extract candidate information.

                        Resume Content:
                        ${cleanedText.substring(0, 5000)}

                        Respond with valid JSON only in this exact format:
                        {
                        "is_valid_resume": true or false,
                        "validation_reason": "max 150 characters or null",
                        "candidate_first_name": "first name or null",
                        "candidate_middle_name": "middle name or null",
                        "candidate_last_name": "last name or null",
                        "candidate_full_name": "full name or null",
                        "phone_number": "10 digit number or null",
                        "email": "email or null",
                        "overview": "professional summary max 250 characters or null"
                        }

                        STRICT RESPONSE RULES:
                        - Return ONLY raw valid JSON.
                        - No markdown, no code block, no explanation.
                        - Total JSON response MUST NOT exceed 900 characters.
                        - "overview" MUST NOT exceed 250 characters.
                        - "validation_reason" MUST NOT exceed 150 characters.
                        - Use concise wording.

                        Resume Validation Rules:
                        - A valid resume MUST contain at least 2 of: name, contact info, work experience, education, skills.
                        - Invalid documents include blank pages, invoices, letters, articles, books, random text, or non-resume PDFs.
                        - If invalid, set "is_valid_resume" to false and provide short reason.

                        Extraction Rules (ONLY if valid):
                        - Extract only candidate personal name.
                        - Extract ONE valid 10-digit Indian phone number (digits only).
                        - Extract primary email only.
                        - Split full name into first, middle (if exists), last.
                        - If any field not found, return null.
                        `;
                    const prompt = [
                        {
                            role: "system",
                            content: "You are an expert resume validator and parser. First validate if the document is a resume, then extract candidate details. Return ONLY a valid JSON object with no formatting, no markdown code blocks, no explanation."
                        },
                        { role: 'user', content }
                    ];
                    return await AI_model(prompt, resumeInfoExtracModel);
                } else {
                    return await extractCandidateInfo(pdfData.substring(0, 5000));
                }
            })()
        ]);

        if (!cvDetails || !cvDetails.is_valid_resume) {
            await pdfFileDelete(file.path);
            return {
                ...responseBack,
                msg: cvDetails
                    ? `${file.originalname}: ${cvDetails.validation_reason}`
                    : `${file.originalname}: AI model failed to extract resume details. please check the resume and try again.`
            };
        }

        // ── PHASE 2: Short DB transaction ─────────────────────────────────
        //  sequelize.transaction instead of promisePool connection
        const saved = await sequelize.transaction(async (t) => {            
            //  tenantQuery instead of connection.execute, ? → :name params
            // check duplicate email
            const existingEntries = await tenantQuery(
                tenant,
                `SELECT id FROM resume_volt_uploaded_resumes
                WHERE email = :email AND is_deleted = false
                LIMIT 1`,
                { replacements: { email: cvDetails.email || '' } },
                t
            );            

            if (existingEntries.length > 0) {
                if (file) await pdfFileDelete(file.path);
                return {
                    ...responseBack,
                    msg: `${cvDetails?.email}: Email already exists in resume volt`
                };
            }

            //  PostgreSQL INSERT syntax, RETURNING id instead of insertId
            // insert into core_uploaded_file_url_master
            const resumeUploadRow = await tenantQuery(
                tenant,
                `INSERT INTO core_uploaded_file_url_master
                    (created_at, file_link, created_by_id, is_deleted)
                 VALUES (:created_at, :file_link, :created_by_id, :is_deleted)
                 RETURNING id`,
                {
                    replacements: {
                        created_at: new Date(),
                        file_link: filePathToHttpURL(systemBaseURL, file.path),
                        created_by_id: userId,
                        is_deleted: false  
                    }
                },
                t
            );
            const resumeFileID = resumeUploadRow[0]?.id;

            //  PostgreSQL INSERT, RETURNING id, JSON.stringify for jsonb
            // insert into resume_volt_uploaded_resumes
            const resumeVoltRow = await tenantQuery(
                tenant,
                `INSERT INTO resume_volt_uploaded_resumes
                    (created_at, resume_id, candidate_first_name, candidate_middle_name,
                     candidate_last_name, candidate_full_name, email, phone_no, is_deleted, job_map_Ids)
                 VALUES
                    (:created_at, :resume_id, :candidate_first_name, :candidate_middle_name,
                     :candidate_last_name, :candidate_full_name, :email, :phone_no, :is_deleted, :job_map_Ids)
                 RETURNING id`,
                {
                    replacements: {
                        created_at:           new Date(),
                        resume_id:            resumeFileID,
                        candidate_first_name:  cvDetails?.candidate_first_name  || null,
                        candidate_middle_name: cvDetails?.candidate_middle_name || null,
                        candidate_last_name:   cvDetails?.candidate_last_name   || null,
                        candidate_full_name:   cvDetails?.candidate_full_name   || null,
                        email:                 cvDetails?.email                 || null,
                        phone_no:              cvDetails?.phone_number          || null,
                        is_deleted:            false,
                        job_map_Ids:           JSON.stringify([])               // ← jsonb column
                    }
                },
                t
            );
            const resumeVoltID = resumeVoltRow[0]?.id;

            return {
                ...responseBack,
                isSaved: true,
                resumeFileID,
                resumeVoltID,
                candidate_name: cvDetails?.candidate_full_name || null,
                phone_number:   cvDetails?.phone_number        || null,
                email:          cvDetails?.email               || null
            };
        });
        // ── Transaction closed — connection returned to pool ──────────────

        //  Pinecone save moved AFTER transaction closes
        // so it doesn't hold DB connection during external call
        if (saved.isSaved && textEmbeddingVector) {
            await saveToPinecone(saved.resumeVoltID, textEmbeddingVector, {
                candidate_first_name:  cvDetails?.candidate_first_name  || '',
                candidate_middle_name: cvDetails?.candidate_middle_name || '',
                candidate_last_name:   cvDetails?.candidate_last_name   || '',
                candidate_full_name:   cvDetails?.candidate_full_name   || '',
                email:                 cvDetails?.email                 || '',
                phone_number:          cvDetails?.phone_number          || '',
                resumeID:              saved.resumeFileID
            });
        }

        return saved;

    } catch (error) {
        await pdfFileDelete(file.path);
        console.error('Database save error:', error);
        return {
            isSaved: false,
            msg: error.message || 'Database error occurred',
            resumeFileID: null,
            resumeVoltID: null
        };
    }
    //  no finally needed — sequelize.transaction handles release
}

//  added tenant param, removed promisePool, use sequelize.transaction + tenantQuery
async function updateToDatabase(file, userId, cvDetails, isAI = false, tenant) {
    const responseBack = {
        isSaved: false,
        resumeFileID: null,
        resumeVoltID: null,
        candidate_name: null,
        phone_number: null,
        email: null
    };

    try {
        // ── PHASE 1: Heavy async work — NO transaction held ───────────────
        //  embedding done BEFORE opening transaction
        let textEmbeddingVector = null;
        if (file && isAI) {
            const pdfData = await pdfExtractort(file.path);
            if (!pdfData) {
                await pdfFileDelete(file.path);
                return { ...responseBack, msg: `${file.originalname}: Not valid file` };
            }
            const cleanedText = await cleanResumeText(pdfData);
            const sortResumeText = await sortResumeWithAI(cleanedText);
            textEmbeddingVector = await textEmbedding(sortResumeText);
        }

        // ── PHASE 2: Short DB transaction ─────────────────────────────────
        //  sequelize.transaction instead of promisePool connection
        const saved = await sequelize.transaction(async (t) => {

            //  tenantQuery, :name params
            // check duplicate email excluding current resumeVoltID
            const existingEntries = await tenantQuery(
                tenant,
                `SELECT id FROM resume_volt_uploaded_resumes
                 WHERE email = :email AND id != :resumeVoltID AND is_deleted = false
                 LIMIT 1`,
                { replacements: { email: cvDetails.email, resumeVoltID: cvDetails.resumeVoltID } },
                t
            );

            if (existingEntries.length > 0) {
                if (file) await pdfFileDelete(file.path);
                return {
                    ...responseBack,
                    isSaved: false,
                    msg: `${cvDetails?.email}: Email already exists in resume volt`
                };
            }

            //  tenantQuery, :name params
            // get resume volt details
            const resumeVoltDetails = await tenantQuery(
                tenant,
                `SELECT * FROM resume_volt_uploaded_resumes
                 WHERE id = :resumeVoltID`,
                { replacements: { resumeVoltID: cvDetails.resumeVoltID } },
                t
            );

            let file_link = null;

            //  tenantQuery, :name params
            // update core_uploaded_file_url_master if new file uploaded
            if (file && resumeVoltDetails[0]?.resume_id) {
                file_link = filePathToHttpURL(systemBaseURL, file.path);
                await tenantQuery(
                    tenant,
                    `UPDATE core_uploaded_file_url_master
                     SET file_link = :file_link, updated_by_id = :updated_by_id
                     WHERE id = :id`,
                    {
                        replacements: {
                            file_link,
                            updated_by_id: userId,
                            id: resumeVoltDetails[0].resume_id
                        },
                        returnMeta: true
                    },
                    t
                );
            }

            //  tenantQuery, :name params
            // update resume_volt_uploaded_resumes
            await tenantQuery(
                tenant,
                `UPDATE resume_volt_uploaded_resumes
                 SET candidate_first_name  = :candidate_first_name,
                     candidate_middle_name = :candidate_middle_name,
                     candidate_last_name   = :candidate_last_name,
                     candidate_full_name   = :candidate_full_name,
                     email                 = :email,
                     phone_no              = :phone_no,
                     resume_id             = :resume_id
                 WHERE id = :resumeVoltID`,
                {
                    replacements: {
                        candidate_first_name:  cvDetails?.candidate_first_name  || null,
                        candidate_middle_name: cvDetails?.candidate_middle_name || null,
                        candidate_last_name:   cvDetails?.candidate_last_name   || null,
                        candidate_full_name:   cvDetails?.candidate_full_name   || null,
                        email:                 cvDetails?.email                 || null,
                        phone_no:              cvDetails?.phone_number          || null,
                        resume_id:             resumeVoltDetails[0]?.resume_id,
                        resumeVoltID:          cvDetails.resumeVoltID
                    },
                    returnMeta: true
                },
                t
            );

            return {
                ...responseBack,
                isSaved: true,
                file_link,
                resumeFileID:          resumeVoltDetails[0]?.resume_id,
                resumeVoltID:          cvDetails.resumeVoltID,
                phone_number:          cvDetails?.phone_number          || null,
                email:                 cvDetails?.email                 || null,
                candidate_first_name:  cvDetails?.candidate_first_name  || null,
                candidate_middle_name: cvDetails?.candidate_middle_name || null,
                candidate_last_name:   cvDetails?.candidate_last_name   || null,
                candidate_full_name:   cvDetails?.candidate_full_name   || null
            };
        });
        // ── Transaction closed — connection returned to pool ──────────────

        //  Pinecone update moved AFTER transaction closes
        if (saved.isSaved && file && textEmbeddingVector && isAI) {
            await updatePinecone(cvDetails.resumeVoltID, textEmbeddingVector, {
                candidate_first_name:  cvDetails?.candidate_first_name  || '',
                candidate_middle_name: cvDetails?.candidate_middle_name || '',
                candidate_last_name:   cvDetails?.candidate_last_name   || '',
                candidate_full_name:   cvDetails?.candidate_full_name   || '',
                email:                 cvDetails?.email                 || '',
                phone_number:          cvDetails?.phone_number          || '',
                resumeID:              cvDetails.resumeVoltID
            });
        }

        return saved;

    } catch (error) {
        if (file) await pdfFileDelete(file.path);
        console.error('Database save error:', error);
        return {
            isSaved: false,
            msg: error.message || 'Database error occurred',
            resumeFileID: null,
            resumeVoltID: null
        };
    }
    //  no finally needed — sequelize.transaction handles release
}