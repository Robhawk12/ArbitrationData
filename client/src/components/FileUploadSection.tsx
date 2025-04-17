import { useState, useRef, useCallback } from "react";
import { apiRequest } from "@/lib/queryClient";
import { useQuery } from "@tanstack/react-query";

interface ProcessedFile {
  id: number;
  filename: string;
  fileSize: number;
  processingDate: string;
  recordsProcessed: number;
  duplicatesFound: number;
  discrepanciesFound: number;
  priority: number;
  fileType: string;
  status: string;
}

interface FileUploadSectionProps {
  onFileProcessed: (result: { 
    message: string; 
    recordsProcessed: number; 
    duplicatesFound: number;
  }) => void;
  onFileError: (error: string) => void;
}

export default function FileUploadSection({ 
  onFileProcessed, 
  onFileError 
}: FileUploadSectionProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [processingFile, setProcessingFile] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Fetch processed files list
  const { data: files = [], refetch: refetchFiles } = useQuery<ProcessedFile[]>({
    queryKey: ['/api/files'],
  });
  
  // Handle file selection from the file input
  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = event.target.files;
    if (!selectedFiles || selectedFiles.length === 0) return;
    
    const file = selectedFiles[0];
    await uploadFile(file);
    
    // Clear the file input for reuse
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };
  
  // Handle file upload zone click
  const handleUploadClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };
  
  // Handle drag over
  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };
  
  // Handle file drop
  const handleFileDrop = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    
    const droppedFiles = event.dataTransfer.files;
    if (droppedFiles.length === 0) return;
    
    // Process only the first file for now
    uploadFile(droppedFiles[0]);
  };
  
  // Handle removing a file
  const handleRemoveFile = async (filename: string) => {
    try {
      await apiRequest('DELETE', `/api/files/${encodeURIComponent(filename)}`);
      refetchFiles();
    } catch (error) {
      onFileError(`Failed to remove file: ${(error as Error).message}`);
    }
  };
  
  // File upload logic
  const uploadFile = async (file: File) => {
    // Validate file type
    const extension = file.name.toLowerCase().split('.').pop();
    if (extension !== 'xlsx' && extension !== 'xls') {
      onFileError('Only Excel files (.xlsx, .xls) are allowed');
      return;
    }
    
    // Validate file size (5MB - 25MB)
    if (file.size < 1024 * 1024) {
      onFileError('File is too small. Min size is 1MB');
      return;
    }
    
    if (file.size > 25 * 1024 * 1024) {
      onFileError('File is too large. Max size is 25MB');
      return;
    }
    
    setIsUploading(true);
    setProcessingFile(file.name);
    setUploadProgress(0);
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      // Use XMLHttpRequest to track progress
      const xhr = new XMLHttpRequest();
      
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const progress = Math.round((event.loaded / event.total) * 100);
          setUploadProgress(progress);
        }
      };
      
      xhr.onload = async () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const response = JSON.parse(xhr.responseText);
          setIsUploading(false);
          setProcessingFile(null);
          refetchFiles();
          onFileProcessed(response);
        } else {
          let errorMessage = 'File upload failed';
          try {
            const errorResponse = JSON.parse(xhr.responseText);
            errorMessage = errorResponse.error || errorMessage;
          } catch (e) {
            // If response isn't valid JSON, use the status text
            errorMessage = xhr.statusText || errorMessage;
          }
          setIsUploading(false);
          setProcessingFile(null);
          onFileError(errorMessage);
        }
      };
      
      xhr.onerror = () => {
        setIsUploading(false);
        setProcessingFile(null);
        onFileError('Network error occurred during file upload');
      };
      
      xhr.open('POST', '/api/upload', true);
      xhr.send(formData);
    } catch (error) {
      setIsUploading(false);
      setProcessingFile(null);
      onFileError(`Upload failed: ${(error as Error).message}`);
    }
  };
  
  return (
    <section className="mb-8">
      <div className="bg-white rounded-md shadow-sm p-4">
        <h2 className="text-[10pt] font-semibold text-neutral-500 mb-3">Data Ingestion</h2>
        
        {/* File Upload Component */}
        <div 
          className="file-upload-zone rounded-md p-8 bg-neutral-100 cursor-pointer text-center"
          onClick={handleUploadClick}
          onDragOver={handleDragOver}
          onDrop={handleFileDrop}
        >
          <div className="flex flex-col items-center justify-center">
            <svg className="w-8 h-8 text-primary mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path>
            </svg>
            <p className="text-[9pt] text-neutral-400 mb-1">Drag and drop Excel files here or click to browse</p>
            <p className="text-[8pt] text-neutral-300">Supported formats: .xlsx, .xls (5MB to 20MB+)</p>
            
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".xlsx,.xls"
              onChange={handleFileSelect}
            />
          </div>
        </div>
        
        {/* Upload Status Section */}
        <div className="mt-4 space-y-2">
          <div className="flex justify-between items-center text-[9pt]">
            <span className="text-neutral-400">Processing Order:</span>
            <span className="text-neutral-500">1. AAA forum data files → 2. JAMS forum data files</span>
          </div>
          
          {/* Processing Status */}
          {isUploading && processingFile && (
            <div className="bg-neutral-100 rounded p-3 mt-3">
              <div className="flex items-center space-x-3">
                <div className="processing-indicator h-2 w-2 rounded-full bg-primary"></div>
                <span className="text-[9pt] text-neutral-400">Processing "{processingFile}"...</span>
                <span className="text-[9pt] text-primary ml-auto">{uploadProgress}%</span>
              </div>
              <div className="w-full bg-neutral-200 rounded-full h-1 mt-2">
                <div 
                  className="bg-primary h-1 rounded-full" 
                  style={{ width: `${uploadProgress}%` }}
                ></div>
              </div>
            </div>
          )}
          
          {/* Uploaded Files List */}
          <div className="mt-3">
            <h3 className="text-[9pt] text-neutral-400 mb-2">Uploaded Files:</h3>
            
            {files.length === 0 && (
              <p className="text-[8pt] text-neutral-300 italic">No files uploaded yet</p>
            )}
            
            {files.map((file) => (
              <div key={file.id} className="flex items-center justify-between p-2 bg-neutral-100 rounded mb-2">
                <div className="flex items-center">
                  <svg className="w-4 h-4 text-primary mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                  </svg>
                  <span className="text-[8pt] text-neutral-500">{file.filename}</span>
                </div>
                <div className="flex items-center">
                  {file.status === "COMPLETED" && file.duplicatesFound === 0 && (
                    <span className="text-[8pt] text-success px-2 py-0.5 rounded-full bg-success bg-opacity-10 flex items-center">
                      <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                      </svg>
                      Processed
                    </span>
                  )}
                  
                  {file.status === "COMPLETED" && file.duplicatesFound > 0 && (
                    <span className="text-[8pt] text-warning px-2 py-0.5 rounded-full bg-warning bg-opacity-10 flex items-center">
                      <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                      </svg>
                      {file.duplicatesFound} Duplicates
                    </span>
                  )}
                  
                  {file.status === "PROCESSING" && (
                    <span className="text-[8pt] text-primary px-2 py-0.5 rounded-full bg-primary bg-opacity-10 flex items-center">
                      <svg className="w-3 h-3 mr-1 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                      </svg>
                      Processing
                    </span>
                  )}
                  
                  <button 
                    className="ml-2 text-neutral-300 hover:text-error"
                    onClick={() => handleRemoveFile(file.filename)}
                    aria-label="Remove file"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
