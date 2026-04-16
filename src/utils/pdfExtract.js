import fs from 'fs-extra';
import path from 'path';
import { PDFParse } from 'pdf-parse'; // ← Correct: default import from 'pdf-parse' (works in v1.x)
import http from 'http';
import https from 'https';

export const pdfExtractort = async (filePath)=>{
    const dataBuffer = await fs.readFile(filePath);
    const parser = new PDFParse({ data: dataBuffer });
    const data = await parser.getText();
    return data.text || null;
}
export const pdfFileDelete = async (filePath)=>{
    try {
        await fs.remove(filePath);
    } catch (error) {
        console.error('File deletion error:', error);
        // Silent fail as per original
    }
}
export const downloadFile = async (url, serverLocationPath)=> {  
  await fs.ensureDir(path.dirname(serverLocationPath));
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(serverLocationPath);
    const mod = url.startsWith('https') ? https : http;
    mod.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: HTTP ${response.statusCode}`));
        return;
      }
      response.pipe(file);
      file.on('finish', () => file.close(() => resolve(serverLocationPath)));
      file.on('error', reject);
    }).on('error', reject);
  });
}
// export const extractCandidateInfo = async (pdfText) => {
//     const result = {
//         candidate_first_name: null,
//         candidate_middle_name: null,
//         candidate_last_name: null,
//         candidate_full_name: null,
//         phone_number: null,
//         email: null,
//         overview: null,
//         is_valid_resume: false,
//         validation_reason: null
//     };

//     if (!pdfText || pdfText.trim().length < 50) {
//         result.validation_reason = 'Document is too short or empty';
//         return result;
//     }

//     // ==================== EXTRACT EMAIL ====================
//     const emailRegex = /\b[a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z]{2,}\b/gi;
//     const emailMatches = pdfText.match(emailRegex);
    
//     if (emailMatches && emailMatches.length > 0) {
//         // Filter out common non-candidate emails
//         const filteredEmails = emailMatches.filter(email => {
//             const lower = email.toLowerCase();
//             return !lower.includes('noreply') && 
//                    !lower.includes('support') && 
//                    !lower.includes('info@') &&
//                    !lower.includes('contact@') &&
//                    !lower.includes('hr@') &&
//                    !lower.includes('admin@') &&
//                    !lower.includes('help@');
//         });
        
//         result.email = filteredEmails[0]?.toLowerCase() || emailMatches[0].toLowerCase();
//     }

//     // ==================== EXTRACT PHONE NUMBER ====================
//     // Updated patterns to handle more formats
//     const phonePatterns = [
//         /\(\d{3}\)\s*\d{3}[-\s]?\d{4}/g,  // (123) 456-7890 or (123)456-7890
//         /\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/g,  // 123-456-7890 or 123.456.7890
//         /(?:\+91[\s-]?)?(?:\(?\d{5}\)?[\s-]?)?\d{5}/g,  // Indian: +91-98765-43210
//         /\b\d{10}\b/g  // Plain 10 digits
//     ];
    
//     let phoneMatches = [];
//     for (const pattern of phonePatterns) {
//         const matches = pdfText.match(pattern);
//         if (matches) {
//             phoneMatches.push(...matches);
//         }
//     }
    
//     if (phoneMatches.length > 0) {
//         // Clean phone numbers and find valid 10-digit ones
//         for (let phone of phoneMatches) {
//             // Remove all non-digits
//             let cleanPhone = phone.replace(/\D/g, '');
            
//             // Handle country code
//             if (cleanPhone.length === 12 && cleanPhone.startsWith('91')) {
//                 cleanPhone = cleanPhone.substring(2);
//             } else if (cleanPhone.length === 11 && cleanPhone.startsWith('1')) {
//                 // US country code
//                 cleanPhone = cleanPhone.substring(1);
//             } else if (cleanPhone.length === 11 && cleanPhone.startsWith('0')) {
//                 cleanPhone = cleanPhone.substring(1);
//             }
            
//             // Validate: should be exactly 10 digits
//             // For Indian numbers: start with 6-9
//             // For US/International: any digit
//             if (cleanPhone.length === 10) {
//                 result.phone_number = cleanPhone;
//                 break;
//             }
//         }
//     }

//     // ==================== EXTRACT NAME ====================
//     const lines = pdfText.split('\n')
//         .map(line => line.trim())
//         .filter(line => line.length > 0);
    
//     // Common resume section headers and patterns to skip
//     const skipPatterns = [
//         /resume|curriculum\s+vitae|cv\b/i,
//         /contact|email|phone|mobile|address|location/i,
//         /objective|summary|profile|about/i,
//         /experience|employment|work\s+history/i,
//         /education|qualification|academic/i,
//         /skills|technical|expertise|competencies/i,
//         /projects|achievements|certifications/i,
//         /references|hobbies|interests/i,
//         /declaration|personal\s+details/i,
//         /page\s+\d+|\d+\s+of\s+\d+/i,  // Page numbers
//         /@|https?:|www\.|linkedin|github/i,  // URLs, emails, social media
//         /\d{4,}/,  // Long numbers (dates, IDs, years)
//         /\d{3}[-.)]/,  // Phone number patterns
//         /software|engineer|developer|designer|analyst|manager|intern/i,  // Job titles
//         /bachelor|master|phd|degree|diploma/i,  // Degrees
//         /seattle|washington|wa\b|new\s+york|california|india/i,  // Locations (expand as needed)
//     ];
    
//     let foundNames = [];
    
//     // Strategy 1: Look for name in first 5 lines (most resumes have name at top)
//     for (let i = 0; i < Math.min(5, lines.length); i++) {
//         const line = lines[i].trim();
        
//         // Skip if line matches any skip pattern
//         if (skipPatterns.some(pattern => pattern.test(line))) {
//             continue;
//         }
        
//         // Skip if too short or too long
//         if (line.length < 2 || line.length > 50) {
//             continue;
//         }
        
//         // Skip if contains numbers or special characters (except spaces, dots, hyphens, apostrophes)
//         if (/[0-9@#$%^&*()_+=[\]{}|\\;:",<>?/]/.test(line)) {
//             continue;
//         }
        
//         // Remove any parentheses content (sometimes job titles in parentheses)
//         const cleanLine = line.replace(/\([^)]*\)/g, '').trim();
        
//         // Pattern 1: All UPPERCASE names (like FALLON WINSLOW)
//         if (/^[A-Z\s.-]{2,50}$/.test(cleanLine) && !/^[A-Z]{1,2}$/.test(cleanLine)) {
//             const nameParts = cleanLine.split(/\s+/).filter(part => part.length > 1);
//             if (nameParts.length >= 1 && nameParts.length <= 4) {
//                 foundNames.push({
//                     full: cleanLine,
//                     parts: nameParts,
//                     score: 10,  // High priority for uppercase names at top
//                     lineNumber: i
//                 });
//             }
//         }
        
//         // Pattern 2: Title Case names (like Fallon Winslow or John M. Doe)
//         const titleCaseRegex = /^([A-Z][a-z]+(?:[\s.-][A-Z]\.?)?(?:\s+[A-Z][a-z]+){0,3})$/;
//         const nameMatch = cleanLine.match(titleCaseRegex);
        
//         if (nameMatch) {
//             const fullName = nameMatch[1].replace(/\s+/g, ' ').trim();
//             const nameParts = fullName.split(/\s+/).filter(part => part.length > 1 || part.endsWith('.'));
            
//             if (nameParts.length >= 2 && nameParts.length <= 4) {
//                 foundNames.push({
//                     full: fullName,
//                     parts: nameParts,
//                     score: 8 - i,  // Higher score for earlier lines
//                     lineNumber: i
//                 });
//             }
//         }
//     }
    
//     // Sort by score (highest first) and line number (earlier first)
//     foundNames.sort((a, b) => {
//         if (b.score !== a.score) return b.score - a.score;
//         return a.lineNumber - b.lineNumber;
//     });
    
//     // Use the best match
//     if (foundNames.length > 0) {
//         const bestMatch = foundNames[0];
//         const nameParts = bestMatch.parts;
        
//         result.candidate_full_name = bestMatch.full;
//         result.candidate_first_name = nameParts[0];
        
//         if (nameParts.length === 2) {
//             // First Last
//             result.candidate_last_name = nameParts[1];
//         } else if (nameParts.length === 3) {
//             // Check if middle part is an initial (single letter or letter with dot)
//             if (nameParts[1].length <= 2 || nameParts[1].endsWith('.')) {
//                 // First M. Last or First M Last
//                 result.candidate_middle_name = nameParts[1].replace('.', '');
//                 result.candidate_last_name = nameParts[2];
//             } else {
//                 // First Middle Last
//                 result.candidate_middle_name = nameParts[1];
//                 result.candidate_last_name = nameParts[2];
//             }
//         } else if (nameParts.length === 4) {
//             // First Middle1 Middle2 Last or First M1. M2. Last
//             result.candidate_middle_name = nameParts[1] + ' ' + nameParts[2];
//             result.candidate_last_name = nameParts[3];
//         }
//     }

//     // ==================== VALIDATE RESUME ====================
//     const resumeKeywords = [
//         'experience', 'education', 'skills', 'work', 'employment',
//         'qualification', 'degree', 'university', 'college', 'projects',
//         'objective', 'summary', 'profile', 'career', 'achievements',
//         'responsibilities', 'internship', 'training', 'certification',
//         'bachelor', 'master', 'phd', 'technical', 'professional'
//     ];
    
//     const lowerText = pdfText.toLowerCase();
//     const keywordCount = resumeKeywords.filter(keyword => lowerText.includes(keyword)).length;
    
//     // Check if we have minimum required information
//     const hasContactInfo = result.email || result.phone_number;
//     const hasName = result.candidate_full_name;
//     const hasResumeKeywords = keywordCount >= 2;  // At least 2 resume-related keywords
    
//     // A valid resume should have at least 2 of: name, contact info, resume keywords
//     const validationCount = [hasName, hasContactInfo, hasResumeKeywords].filter(Boolean).length;
    
//     if (validationCount >= 2) {
//         result.is_valid_resume = true;
//     } else {
//         if (!hasResumeKeywords) {
//             result.validation_reason = 'Document does not appear to be a resume (missing key sections like experience, education, or skills)';
//         } else if (!hasContactInfo && !hasName) {
//             result.validation_reason = 'No contact information or candidate name found in the document';
//         } else if (!hasName) {
//             result.validation_reason = 'Candidate name not found in the document';
//         } else if (!hasContactInfo) {
//             result.validation_reason = 'No contact information (email or phone) found in the document';
//         } else {
//             result.validation_reason = 'Incomplete resume information detected';
//         }
//     }

//     return result;
// };
export const extractCandidateInfo = async (pdfText) => {
    const result = {
        candidate_first_name: null,
        candidate_middle_name: null,
        candidate_last_name: null,
        candidate_full_name: null,
        phone_number: null,
        email: null,
        overview: null,  
        is_valid_resume: false,
        validation_reason: null
    };

    if (!pdfText || pdfText.trim().length < 50) {
        result.validation_reason = 'Document is too short or empty';
        return result;
    }

    const safeSubstring = (text, max) => {
        if (!text) return null;
        return text.length > max ? text.substring(0, max).trim() : text.trim();
    };

    // ==================== EXTRACT EMAIL ====================
    const emailRegex = /\b[a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z]{2,}\b/gi;
    const emailMatches = pdfText.match(emailRegex);

    if (emailMatches && emailMatches.length > 0) {
        const filteredEmails = emailMatches.filter(email => {
            const lower = email.toLowerCase();
            return !lower.includes('noreply') &&
                   !lower.includes('support') &&
                   !lower.includes('info@') &&
                   !lower.includes('contact@') &&
                   !lower.includes('hr@') &&
                   !lower.includes('admin@') &&
                   !lower.includes('help@');
        });

        result.email = filteredEmails[0]?.toLowerCase() || emailMatches[0].toLowerCase();
    }

    // ==================== EXTRACT PHONE ====================
    const phonePatterns = [
        /\(\d{3}\)\s*\d{3}[-\s]?\d{4}/g,
        /\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/g,
        /(?:\+91[\s-]?)?(?:\(?\d{5}\)?[\s-]?)?\d{5}/g,
        /\b\d{10}\b/g
    ];

    let phoneMatches = [];
    for (const pattern of phonePatterns) {
        const matches = pdfText.match(pattern);
        if (matches) phoneMatches.push(...matches);
    }

    if (phoneMatches.length > 0) {
        for (let phone of phoneMatches) {
            let cleanPhone = phone.replace(/\D/g, '');

            if (cleanPhone.length === 12 && cleanPhone.startsWith('91')) {
                cleanPhone = cleanPhone.substring(2);
            } else if (cleanPhone.length === 11 && cleanPhone.startsWith('1')) {
                cleanPhone = cleanPhone.substring(1);
            } else if (cleanPhone.length === 11 && cleanPhone.startsWith('0')) {
                cleanPhone = cleanPhone.substring(1);
            }

            if (cleanPhone.length === 10) {
                result.phone_number = cleanPhone;
                break;
            }
        }
    }

    // ==================== EXTRACT NAME ====================
    const lines = pdfText.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);

    const skipPatterns = [
        /resume|curriculum\s+vitae|cv\b/i,
        /contact|email|phone|mobile|address|location/i,
        /objective|summary|profile|about/i,
        /experience|employment|work\s+history/i,
        /education|qualification|academic/i,
        /skills|technical|expertise|competencies/i,
        /projects|achievements|certifications/i,
        /references|hobbies|interests/i,
        /declaration|personal\s+details/i,
        /page\s+\d+|\d+\s+of\s+\d+/i,
        /@|https?:|www\.|linkedin|github/i,
        /\d{4,}/,
        /software|engineer|developer|designer|analyst|manager|intern/i,
        /bachelor|master|phd|degree|diploma/i
    ];

    let foundNames = [];

    for (let i = 0; i < Math.min(5, lines.length); i++) {
        const line = lines[i];

        if (skipPatterns.some(pattern => pattern.test(line))) continue;
        if (line.length < 2 || line.length > 50) continue;
        if (/[0-9@#$%^&*()_+=[\]{}|\\;:",<>?/]/.test(line)) continue;

        const cleanLine = line.replace(/\([^)]*\)/g, '').trim();

        if (/^[A-Z\s.-]{2,50}$/.test(cleanLine)) {
            const parts = cleanLine.split(/\s+/).filter(p => p.length > 1);
            if (parts.length >= 1 && parts.length <= 4) {
                foundNames.push({ full: cleanLine, parts, score: 10 });
            }
        }

        const titleCaseRegex = /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})$/;
        const match = cleanLine.match(titleCaseRegex);

        if (match) {
            const fullName = match[1].trim();
            const parts = fullName.split(/\s+/);
            foundNames.push({ full: fullName, parts, score: 8 - i });
        }
    }

    foundNames.sort((a, b) => b.score - a.score);

    if (foundNames.length > 0) {
        const best = foundNames[0];
        const parts = best.parts;

        result.candidate_full_name = best.full;
        result.candidate_first_name = parts[0];

        if (parts.length === 2) {
            result.candidate_last_name = parts[1];
        } else if (parts.length >= 3) {
            result.candidate_middle_name = parts.slice(1, parts.length - 1).join(' ');
            result.candidate_last_name = parts[parts.length - 1];
        }
    }

    // ==================== VALIDATION ====================
    const resumeKeywords = [
        'experience','education','skills','work','employment',
        'qualification','degree','university','college',
        'projects','objective','summary','profile'
    ];

    const lowerText = pdfText.toLowerCase();
    const keywordCount = resumeKeywords.filter(k => lowerText.includes(k)).length;

    const hasContactInfo = result.email || result.phone_number;
    const hasName = result.candidate_full_name;
    const hasResumeKeywords = keywordCount >= 2;

    const validationCount = [hasName, hasContactInfo, hasResumeKeywords].filter(Boolean).length;

    if (validationCount >= 2) {
        result.is_valid_resume = true;

        // ==================== GENERATE OVERVIEW ====================
        const summaryMatch = pdfText.match(/(summary|profile|objective)[\s\S]{0,500}/i);
        
        if (summaryMatch) {
            result.overview = safeSubstring(
                summaryMatch[0]
                    .replace(/\s+/g, ' ')
                    .replace(/(summary|profile|objective)/i, '')
                    .trim(),
                250
            );
        } else {
            result.overview = safeSubstring(
                `Professional with experience in ${resumeKeywords
                    .filter(k => lowerText.includes(k))
                    .slice(0, 3)
                    .join(', ')}`,
                250
            );
        }

    } else {
        result.validation_reason = safeSubstring(
            'Document does not meet minimum resume criteria',
            150
        );
    }

    return result;
};

export const cleanResumeText = async (text) => {
    if (!text) return '';
    
    return text
        // Remove excessive whitespace
        .replace(/\s+/g, ' ')
        // Remove non-printable characters
        .replace(/[^\x20-\x7E\n]/g, '')
        // Normalize line breaks
        .replace(/\n{3,}/g, '\n\n')
        // Trim
        .trim();
};