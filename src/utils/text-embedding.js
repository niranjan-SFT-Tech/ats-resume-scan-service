import ModelClient, { isUnexpected } from "@azure-rest/ai-inference";
import { AzureKeyCredential } from "@azure/core-auth";
import { githubToken, githubTextEmbeddingModel, modelApiUrl, pineconeKey, pineconeHost, resumeInfoExtracModel } from './../configs/index.js';
import { Pinecone } from "@pinecone-database/pinecone";
import AI_model from "./AI_model.js"; 

const pc = new Pinecone({
  apiKey: pineconeKey,
  host: pineconeHost
});
///////
// export default async (embeddedText) => { 
//   try {
//     const client = ModelClient(modelApiUrl, new AzureKeyCredential(githubToken)); 
//     const response = await client.path("/embeddings").post({
//       body: {
//         model: githubTextEmbeddingModel,
//         input: embeddedText,
//         dimensions: 1536
//       }
//     });
//     if (isUnexpected(response)) {
//         throw response.body.error;
//     }
//     for (const item of response.body.data) {
//         let length = item.embedding.length;
//         console.log(
//         `data[${item.index}]: length=${length}, ` +
//         `[${item.embedding[0]}, ${item.embedding[1]}, ` +
//         `..., ${item.embedding[length - 2]}, ${item.embedding[length -1]}]`);
//     }
//     // console.log(response.body.usage);
//     return response.body.data[0].embedding;
//   } catch (err) {
//       console.log(err);
//       throw err;
//   }
// }

export default async (embeddedText) => { 
  // console.log('embeddedText', embeddedText);
  
  try {
    // // clean the text to remove "noise" that lowers the score
    // const cleanedText = embeddedText
    //   .replace(/(References|available|upon|request|page|hiring|manager|curriculum|vitae|resume)/gi, '') // Remove fluff
    //   .replace(/[^\w\s,.+#-]/g, ' ') // Keep only essential chars (important for C++, C#, .NET)
    //   .replace(/\s+/g, ' ') // Collapse extra spaces
    //   .trim()
    //   .substring(0, 4000); // Focus on the most relevant part
    const client = ModelClient(modelApiUrl, new AzureKeyCredential(githubToken));     
    const response = await client.path("/embeddings").post({
      body: {
        model: githubTextEmbeddingModel,
        input: embeddedText,  
        dimensions: 1536
      }
    });
    if (isUnexpected(response)) {
        throw response.body.error;
    }    
    return response.body.data[0].embedding;
  } catch (err) {
      console.error("Embedding Utility Error:", err);
      throw err;
  }
}
// AI-powered search extended
export async function searchTextElaborated(searchText) {    
    const searchPrompt = `
    You are a search expert for vector databases. Elaborate search text for semantic search.

    OBJECTIVE:
    Enhance the search query for better semantic matching in English.

    TASKS:
    - Detect the language of the input text
    - If the text is in a non-English language, translate it to English first
    - Fix any spelling errors
    - Expand abbreviations and acronyms where helpful
    - Add related terms and synonyms
    - Maintain the original search intent
    - Output ONLY the enhanced English search text

    Search query: ${searchText}`;
      
    const prompt = [
        { 
            role: "system", 
            content: "You are a search query optimization expert. Convert any non-English queries to English, then enhance them for better semantic search results. Return only the enhanced English search text with no formatting, translation notes, or explanation." 
        },
        { 
            role: 'user', 
            content: searchPrompt 
        }
    ]; 
    const result = await AI_model(prompt, resumeInfoExtracModel, false);    
    console.log('searchText------', result);
    return result ? result : searchText; 
}
// AI-powered resume sorting function
export async function sortResumeWithAI(resumeText) {  
    const sortingPrompt = `
    You are a resume optimization AI. Reorder the following resume content to maximize relevance for indexing and semantic search.

    OBJECTIVE:
    Reorder sections strictly by defined priority without modifying any text.

    PRIORITY ORDER (Highest to Lowest):
    
    1. Technical Skills / Core Competencies
    2. Professional Summary (ensure total years of experience appears early if mentioned)
    3. Key Achievements / Quantifiable Results
    4. Recent Work Experience (last 5 years)
    5. Notable Projects
    6. Older Work Experience
    7. Education and Certifications
    8. Generic Information (Full Name, Phone, Email, Contact Details, LinkedIn, Address)

    STRICT RULES:
    - Keep ALL original text exactly as written.
    - Do NOT rewrite, summarize, paraphrase, or remove anything.
    - Do NOT add commentary, explanations, labels, numbering, JSON, markdown, or formatting.
    - Output ONLY the reordered resume text in plain text format.
    - Do NOT include section titles unless they already exist in the original resume.
    - If achievements are embedded within work experience, keep them within that block.

    RESUME TO REORDER:
    ${resumeText}`;
      
    let prompt = [
        { 
            role: "system", 
            content: "You are an expert resume validator and parser. First validate if the document is a resume, then extract candidate details. Return ONLY a valid JSON object with no formatting, no markdown code blocks, no explanation." 
        },
        { 
            role: 'user', 
            content: sortingPrompt 
        }
    ]; 
    const result = await AI_model(prompt, resumeInfoExtracModel, false);
    return result; 
}
//////PINECONE 
export const saveToPinecone = async (resumeVoltId, embeddedData, metaData) => {
  try {
    if (!embeddedData || !Array.isArray(embeddedData) || embeddedData.length === 0) {
        throw new Error("embeddedData is empty or not an array");
    }
    const index = pc.index({name:'ats', });    
    const record = {
      id: resumeVoltId.toString(),
      values: embeddedData,  
      metadata: {
        ...metaData,
        resumeVoltId: resumeVoltId
      }
    };
    await index.upsert({
      records: [record]
    }); 
    // console.log('Pinecone upsert response:', record);       
    // console.log(`Successfully saved resumeVoltId: ${resumeVoltId}`);
  } catch (error) {
    console.error("Pinecone Error details:", error);
    throw error; // RE-THROW so the transaction can rollback
  }
}

export const updatePinecone = async (resumeVoltId, embeddedData, metaData) => {
  try {
    const index = pc.index({name:'ats'});  
    const fetchResponse = await index.fetch({
      ids: [resumeVoltId.toString()]
    });
    if (!fetchResponse.records[resumeVoltId.toString()]) {
      await saveToPinecone(resumeVoltId, embeddedData, metaData); // If record doesn't exist, create it
    } else {
      await index.update({
        id: resumeVoltId.toString(), // ID of the vector to update
        values: embeddedData, // New embedding vector
        metadata:  {
          ...metaData,
          resumeVoltId: resumeVoltId
        } // Updated metadata
      });  
    }      
    console.log(`Successfully updated Pinecone vector: ${resumeVoltId}`);
  }catch (error) {
    console.error("Pinecone Error details:", error);
    throw error; // RE-THROW so the transaction can rollback
  }
}

export const searchPinecone = async (embeddedData, options = {}) => { 
  try {
    const index = pc.index({name:'ats'});  
    // console.log('options', options, Number(options.topK));      
    const queryConfig = {
      vector: embeddedData,
      topK: Number(options.topK) || 10,
      includeMetadata: options.includeMetadata ?? true,
      includeValues: options.includeValues ?? false,
      filter: options.filter || null
    };    
    // Only add namespace if provided
    if (options.namespace) {
      queryConfig.namespace = options.namespace;
    }    
    // Only add filter if it has properties
    if (options.filter && Object.keys(options.filter).length > 0) {
      queryConfig.filter = options.filter;
    }    
    const queryResult = await index.query(queryConfig); 
    queryResult.matches.sort((a, b) => b.score - a.score);      
    // console.log('queryResult', queryResult); 
    return queryResult.matches;    
  } catch (error) {
    console.error('Pinecone search error:', error);
    throw error;
  }
}