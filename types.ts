export interface JobResult {
  imageData: string; // base64 data URL
  prompt?: string; // The prompt used to generate this specific image (optional for the base image)
}

export interface ImageJob {
  id: string;
  originalImage: {
    data: string; // base64 data URL
    mimeType: string;
  };
  status: 'generating' | 'completed' | 'error';
  results: JobResult[]; // array of JobResult objects
  prompt: string;
  generatingPresets?: string[];
}