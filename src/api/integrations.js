// Import local API integrations instead of Base44
import { 
  Core, 
  InvokeLLM, 
  SendEmail, 
  UploadFile, 
  GenerateImage, 
  ExtractDataFromUploadedFile, 
  CreateFileSignedUrl, 
  UploadPrivateFile 
} from './localIntegrations';

// Re-export for compatibility
export { 
  Core, 
  InvokeLLM, 
  SendEmail, 
  UploadFile, 
  GenerateImage, 
  ExtractDataFromUploadedFile, 
  CreateFileSignedUrl, 
  UploadPrivateFile 
};






