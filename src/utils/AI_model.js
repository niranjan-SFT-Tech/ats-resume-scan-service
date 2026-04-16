// import { promisePool } from '../loaders/mySQL.js';
import OpenAI from 'openai';
import { githubToken, githubModel } from '../configs/index.js';
import { githubModelsArray, githubBaseURI } from '../utils/githubAI_model.js'

const client = new OpenAI({
  apiKey: githubToken,
  baseURL: githubBaseURI,
});
// let MODEL = githubModel
export default async (prompt=[], AIModel=githubModel, isJson=true ) => {  
      let attempts = 0;
      const maxAttempts = 6;
      while (attempts < maxAttempts) {
        try {
          console.log(`Using Model- ${AIModel}`);      
          const response = await client.chat.completions.create({
            model: AIModel,
            messages: prompt,
            max_tokens: 400, //250
            temperature: 0.7,
            response_format:  { type: isJson ? "json_object" : "text" }, // Forces structured JSON output
          });           
          const msg = response.choices?.[0]?.message?.content;          
          if(!msg){         
            const err = new Error(`Empty response from ${AIModel} model`);
            err.status = 429;
            throw err
          } 
          let result;
          if(isJson){  
            let rawContent = msg.trim() || ''; 
            if(!isValidJSON(rawContent)){ 
              const err = new Error(AIModel+' Model returned invalid JSON');
              err.status = 429;
              throw err
            }
            result = JSON.parse(rawContent);             
          }else{
            result = msg;
          }
          return result;
        } 
        catch (error) {
          //retry logic using for free AI model uses
          if (error.status === 429 || (error.message && error.message.includes('429'))) {
            attempts++;
            // MODEL = githubModelsArray[attempts]; // Switch model on rate limit
            AIModel = githubModelsArray[attempts % githubModelsArray.length]; // Switch model on rate limit
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

function isValidJSON(data) {
  if (typeof data !== "string" || !data.trim()) return false;

  // Remove markdown code blocks
  data = data.replace(/```json|```/g, "").trim();

  // Extract JSON part
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