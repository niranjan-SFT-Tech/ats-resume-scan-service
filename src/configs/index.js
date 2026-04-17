import { config } from 'dotenv';
config({ quiet: true });

const { DB_NAME, DB_USER, DB_PASSWORD, DB_HOST, DB_PORT, SERVER_PORT, GITHUB_TOKEN, GITHUB_MODEL, UPLOAD_DIR, MEDIA_FILE_ROOT_PATH , MEDIA_SUB_FOLDER_PATH , MEDIA_BASE_PATH_LINK ,GITHUB_TEXT_EMBEDDING_MODEL, RESUME_INFO_EXTRACT_MODEL, MODEL_API_URL, PINECONE_KEY, PINECONE_HOST, NODE_ENV} = process.env


export const server_port = SERVER_PORT;
// export const jwtSecretKey = JWT_SECRET_KEY; //JWT_SECRET_KEY
// export const refreshTokenSecretKey = REFRESH_TOKEN_SECRET_KEY; //REFRESH_TOKEN_SECRET_KEY
export const dbName = DB_NAME;  
export const dbUser = DB_USER;  
export const dbPassword = DB_PASSWORD;
export const dbHost = DB_HOST;  
export const dbPort = DB_PORT;
// export const awsSecretAccessKey = AWS_SECRET_ACCESS_KEY;
// export const awsRegion = AWS_REGION;
// export const bucketName = BUCKET_NAME;
export const upload_dir = UPLOAD_DIR; //directory to save uploaded files
export const media_root_path = MEDIA_FILE_ROOT_PATH;
export const media_sub_folder_path = MEDIA_SUB_FOLDER_PATH;
export const media_base_path_link = MEDIA_BASE_PATH_LINK

export const prefix = '/ats';
export const nodeEnv  = NODE_ENV;
export const githubToken = GITHUB_TOKEN;
export const githubModel = GITHUB_MODEL;
export const githubTextEmbeddingModel = GITHUB_TEXT_EMBEDDING_MODEL;
export const resumeInfoExtracModel = RESUME_INFO_EXTRACT_MODEL;
export const modelApiUrl = MODEL_API_URL;

export const pineconeKey = PINECONE_KEY;
export const pineconeHost = PINECONE_HOST;
