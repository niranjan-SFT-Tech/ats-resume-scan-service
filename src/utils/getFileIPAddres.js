// import url  from 'node:url';
// import path from 'node:path'; 
import { upload_dir } from '../configs/index.js';
import path from "path";
import url from "url";

// Get baseURL
export const getBaseURL = (protocal, host) => {
  return `${protocal}://${host}`;
}

export const filePathToHttpURL = (baseURL, filePath) => {
  const mediaRoot = "/var/www/html/producthrmsmanagement/media";
  // Convert FS path → relative HTTP path
  const relativePath = filePath.replace(mediaRoot, "").replace(/\\/g, "/");
  return `${baseURL}/producthrmsmanagement/media${relativePath}`;
};
//old code
// Convert file path to HTTP URL with IP
// export const filePathToHttpURL = (baseURL, filePath, staticRoute = upload_dir) => {
//   console.log(upload_dir,"--Upload DIr")   
//   const fileName = path.basename(filePath);  
//   const httpURL = new url.URL(`${baseURL}`); 
//   httpURL.pathname = `${staticRoute}/${fileName}`;  
//   console.log(httpURL.href,"httpURL.href")
//   console.log(httpURL.pathname,"httpURL.pathname")
//   return httpURL.href;
// }

// // // Example usage
// const file = { path: 'file:///C:/var/www/html/tkg/producthrmstkg/media/uploads/resume-sample-1770285899260-704969235.pdf' };
// const correctURL = filePathToHttpURL(file.path);
// console.log(correctURL); 
// // http://192.168.1.100:3000/uploads/document.pdf