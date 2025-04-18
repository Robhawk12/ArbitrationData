import { useState, useRef } from "react";
import { apiRequest } from "@/lib/queryClient";
import { useQuery } from "@tanstack/react-query";
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

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
  const [uploadComplete, setUploadComplete] = useState(false);
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
  
  // Handle clearing all data
  const [showClearConfirmation, setShowClearConfirmation] = useState(false);
  
  const handleClearAllData = async () => {
    try {
      console.log("Clearing all data...");
      const response = await apiRequest('DELETE', '/api/clearAll');
      console.log("Clear data response:", response);
      
      // Ensure we get a fresh reload of data
      setTimeout(() => {
        refetchFiles();
        onFileProcessed({
          message: 'All data has been cleared successfully',
          recordsProcessed: 0,
          duplicatesFound: 0
        });
        setShowClearConfirmation(false);
      }, 500);
    } catch (error) {
      console.error("Clear data error:", error);
      onFileError(`Failed to clear all data: ${(error as Error).message}`);
      setShowClearConfirmation(false);
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
          setUploadComplete(true);
          
          // Auto-hide the success message after 5 seconds
          setTimeout(() => {
            setUploadComplete(false);
          }, 5000);
          
          // Refresh the files list and notify parent component
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
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-[10pt] font-semibold text-neutral-500">Data Ingestion</h2>
          
          {/* Clear All Data Button */}
          <Button 
            variant="destructive" 
            size="sm"
            onClick={() => setShowClearConfirmation(true)}
            className="text-[8pt] h-8"
          >
            <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
            </svg>
            Clear All Data
          </Button>
        </div>
        
        {/* File Upload Component */}
        <div 
          className="file-upload-zone rounded-md p-4 bg-neutral-100 cursor-pointer text-center"
          onClick={handleUploadClick}
          onDragOver={handleDragOver}
          onDrop={handleFileDrop}
        >
          <div className="flex flex-col items-center justify-center">
            <svg className="w-6 h-6 text-primary mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
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
          
          {/* Upload Complete Notification */}
          {uploadComplete && !isUploading && (
            <div className="bg-success bg-opacity-10 rounded p-3 mt-3 animate-pulse">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <svg className="w-5 h-5 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                  </svg>
                  <span className="text-[9pt] font-medium text-success">File processing complete!</span>
                </div>
                <button 
                  onClick={() => setUploadComplete(false)}
                  className="text-success hover:text-success-dark"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                  </svg>
                </button>
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
                  {file.status === "COMPLETED" && (
                    <span className="text-[8pt] text-success px-2 py-0.5 rounded-full bg-success bg-opacity-10 flex items-center">
                      <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                      </svg>
                      Processed
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
      
      {/* Confirmation Dialog for Clear All Data */}
      <AlertDialog open={showClearConfirmation} onOpenChange={setShowClearConfirmation}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear All Data</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all cases and uploaded files from the database.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleClearAllData();
              }} 
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Clear Data
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
