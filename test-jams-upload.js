import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import FormData from 'form-data';
import fetch from 'node-fetch';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// JAMS file to test with
const jamsFile = './attached_assets/jams-consumer-case-information (Demands 1.21.21-8.3.23) (downloaded 7.28.24) - formatted.xlsx';

// Function to upload a file
async function uploadFile(filePath) {
  try {
    const form = new FormData();
    const fileStream = fs.createReadStream(filePath);
    form.append('file', fileStream, path.basename(filePath));
    
    console.log(`Uploading ${path.basename(filePath)}...`);
    
    const response = await fetch('http://localhost:5000/api/upload', {
      method: 'POST',
      body: form,
    });
    
    const result = await response.json();
    console.log(`Result for ${path.basename(filePath)}:`, result);
    return result;
  } catch (error) {
    console.error(`Error uploading ${path.basename(filePath)}:`, error);
    return null;
  }
}

// Upload JAMS file
async function uploadJamsFile() {
  console.log("Starting JAMS file upload test...");
  await uploadFile(jamsFile);
  console.log("JAMS file upload test completed!");
}

// Run the upload
uploadJamsFile();