import { localClient } from './localClient';

// AI Integration - InvokeLLM
export const InvokeLLM = async ({ prompt, add_context_from_internet = false, response_json_schema = null }) => {
  return localClient.post('/ai/invoke-llm', {
    prompt,
    add_context_from_internet,
    response_json_schema
  });
};

// Email Integration
export const SendEmail = async ({ to, subject, body, html = null }) => {
  return localClient.post('/integrations/send-email', {
    to,
    subject,
    body,
    html
  });
};

// File Upload Integration
export const UploadFile = async (file, options = {}) => {
  const formData = new FormData();
  formData.append('file', file);
  
  // Add any additional options
  Object.entries(options).forEach(([key, value]) => {
    formData.append(key, value);
  });

  const response = await fetch(`${localClient.baseURL}/integrations/upload-file`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${localClient.token}`,
    },
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Upload failed: ${response.statusText}`);
  }

  return response.json();
};

// Image Generation Integration
export const GenerateImage = async ({ prompt, size = '1024x1024', quality = 'standard' }) => {
  return localClient.post('/integrations/generate-image', {
    prompt,
    size,
    quality
  });
};

// Data Extraction from Uploaded File
export const ExtractDataFromUploadedFile = async (fileId, extractionPrompt) => {
  return localClient.post('/integrations/extract-data', {
    file_id: fileId,
    extraction_prompt: extractionPrompt
  });
};

// Create File Signed URL
export const CreateFileSignedUrl = async (fileId, expiresIn = 3600) => {
  return localClient.post('/integrations/create-signed-url', {
    file_id: fileId,
    expires_in: expiresIn
  });
};

// Upload Private File
export const UploadPrivateFile = async (file, options = {}) => {
  const formData = new FormData();
  formData.append('file', file);
  
  // Add any additional options
  Object.entries(options).forEach(([key, value]) => {
    formData.append(key, value);
  });

  const response = await fetch(`${localClient.baseURL}/integrations/upload-private-file`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${localClient.token}`,
    },
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Private upload failed: ${response.statusText}`);
  }

  return response.json();
};

// Core integrations object for compatibility
export const Core = {
  InvokeLLM,
  SendEmail,
  UploadFile,
  GenerateImage,
  ExtractDataFromUploadedFile,
  CreateFileSignedUrl,
  UploadPrivateFile
};