import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import multer from "multer";
import { read, utils } from "xlsx";
import path from "path";
import { insertArbitrationCaseSchema, insertProcessedFileSchema } from "@shared/schema";
import { z } from "zod";

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB limit (to accommodate 20MB+ files)
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.xlsx' && ext !== '.xls') {
      return cb(new Error('Only Excel files (.xlsx, .xls) are allowed'));
    }
    cb(null, true);
  }
});

export async function registerRoutes(app: Express): Promise<Server> {
  // prefix all routes with /api
  
  // Get cases with pagination and optional filtering
  app.get("/api/cases", async (req: Request, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 100;
      const filter = req.query.filter as string | undefined;
      
      const cases = await storage.getCases(page, limit, filter);
      const totalCount = await storage.getCaseCount(filter);
      
      res.json({
        data: cases,
        pagination: {
          page,
          limit,
          total: totalCount,
          totalPages: Math.ceil(totalCount / limit)
        }
      });
    } catch (error) {
      res.status(500).json({ error: `Failed to fetch cases: ${(error as Error).message}` });
    }
  });
  
  // Get a single case by ID
  app.get("/api/cases/:caseId", async (req: Request, res: Response) => {
    try {
      const caseData = await storage.getCaseById(req.params.caseId);
      if (!caseData) {
        return res.status(404).json({ error: "Case not found" });
      }
      res.json(caseData);
    } catch (error) {
      res.status(500).json({ error: `Failed to fetch case: ${(error as Error).message}` });
    }
  });
  
  // Get all processed files
  app.get("/api/files", async (_req: Request, res: Response) => {
    try {
      const files = await storage.getProcessedFiles();
      res.json(files);
    } catch (error) {
      res.status(500).json({ error: `Failed to fetch files: ${(error as Error).message}` });
    }
  });
  
  // Get data summary for dashboard
  app.get("/api/summary", async (_req: Request, res: Response) => {
    try {
      const summary = await storage.getDataSummary();
      res.json(summary);
    } catch (error) {
      res.status(500).json({ error: `Failed to generate summary: ${(error as Error).message}` });
    }
  });
  
  // Upload and process Excel files
  app.post("/api/upload", upload.single("file"), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }
      
      const fileBuffer = req.file.buffer;
      const fileName = req.file.originalname;
      const fileSize = req.file.size;
      
      // Determine if AAA or JAMS file based on filename for prioritization
      const isAAA = fileName.toLowerCase().includes('aaa') || 
                    !fileName.toLowerCase().includes('jams');
      const priority = isAAA ? 1 : 2; // AAA has higher priority (lower number)
      
      // Check if file already processed
      const existingFile = await storage.getProcessedFileByName(fileName);
      if (existingFile) {
        return res.status(409).json({ 
          error: "File already processed", 
          fileId: existingFile.id 
        });
      }
      
      // Read Excel file
      const workbook = read(fileBuffer);
      const sheetNames = workbook.SheetNames;
      
      if (sheetNames.length === 0) {
        return res.status(400).json({ error: "Excel file contains no sheets" });
      }
      
      // Process first sheet (can be enhanced to process specific or all sheets)
      const worksheet = workbook.Sheets[sheetNames[0]];
      const jsonData = utils.sheet_to_json(worksheet);
      
      if (jsonData.length === 0) {
        return res.status(400).json({ error: "No data found in Excel file" });
      }
      
      // Insert processed file record
      const fileRecord = await storage.createProcessedFile({
        filename: fileName,
        fileSize: fileSize,
        recordsProcessed: 0,
        duplicatesFound: 0,
        discrepanciesFound: 0,
        priority: priority,
        fileType: isAAA ? "AAA" : "JAMS",
        status: "PROCESSING"
      });
      
      // Process and standardize data
      let recordsProcessed = 0;
      let duplicatesFound = 0;
      let discrepanciesFound = 0;
      
      for (const row of jsonData) {
        try {
          // Extract and standardize fields
          // This is a simplified approach - would need customization for specific file formats
          const caseId = extractField(row, ['case_id', 'caseid', 'case #', 'case number', 'id']) || 
                        `${isAAA ? 'AAA' : 'JAMS'}-${Date.now()}-${recordsProcessed}`;
                        
          const forum = isAAA ? "AAA" : "JAMS";
          const arbitratorName = extractField(row, ['arbitrator', 'arbitrator name', 'arbitratorname', 'arbitrator_name']);
          const claimantName = extractField(row, ['claimant', 'claimant name', 'claimantname', 'claimant_name', 'plaintiff']);
          const respondentName = extractField(row, ['respondent', 'respondent name', 'respondentname', 'respondent_name', 'defendant']);
          
          // Parse filing date - handles multiple formats
          const filingDateRaw = extractField(row, ['filing date', 'filingdate', 'filing_date', 'date filed', 'date_filed']);
          const filingDate = filingDateRaw ? new Date(filingDateRaw) : null;
          
          const disposition = extractField(row, ['disposition', 'outcome', 'result']);
          const awardAmount = extractField(row, ['award', 'award amount', 'awardamount', 'award_amount', 'amount']);
          
          // Check for duplicates
          const existingCase = await storage.getCaseById(caseId);
          
          if (existingCase) {
            duplicatesFound++;
            
            // Insert as duplicate but reference original
            await storage.createCase({
              caseId: `${caseId}-dup-${duplicatesFound}`,
              forum,
              arbitratorName,
              claimantName,
              respondentName,
              filingDate,
              disposition,
              awardAmount,
              status: "DUPLICATE",
              sourceFile: fileName,
              duplicateOf: caseId,
              hasDiscrepancies: false,
              rawData: JSON.stringify(row)
            });
            
            continue;
          }
          
          // Track discrepancies (missing critical data)
          const hasDiscrepancies = !arbitratorName || !claimantName || !respondentName || !filingDate || !disposition;
          if (hasDiscrepancies) {
            discrepanciesFound++;
          }
          
          // Determine case status
          let status = "COMPLETED";
          if (disposition?.toLowerCase().includes('withdrawn')) {
            status = "CLOSED";
          } else if (disposition?.toLowerCase().includes('dismissed')) {
            status = "CLOSED";
          }
          
          // Create case record
          await storage.createCase({
            caseId,
            forum,
            arbitratorName,
            claimantName,
            respondentName,
            filingDate,
            disposition,
            awardAmount,
            status,
            sourceFile: fileName,
            hasDiscrepancies,
            rawData: JSON.stringify(row)
          });
          
          recordsProcessed++;
        } catch (error) {
          console.error("Error processing row:", error);
          discrepanciesFound++;
        }
      }
      
      // Update file record with results
      await storage.updateProcessedFile(fileRecord.id, {
        recordsProcessed,
        duplicatesFound,
        discrepanciesFound,
        status: "COMPLETED"
      });
      
      res.status(201).json({
        message: "File processed successfully",
        fileId: fileRecord.id,
        recordsProcessed,
        duplicatesFound,
        discrepanciesFound
      });
      
    } catch (error) {
      console.error("File upload error:", error);
      res.status(500).json({ error: `File processing failed: ${(error as Error).message}` });
    }
  });
  
  // Delete a processed file and its associated cases
  app.delete("/api/files/:filename", async (req: Request, res: Response) => {
    try {
      const filename = req.params.filename;
      
      // Fetch all cases with this source file
      const allCases = await storage.getCases(1, 10000);  // Large limit to get all
      const casesToDelete = allCases.filter(c => c.sourceFile === filename);
      
      // Delete all cases from this file
      for (const caseData of casesToDelete) {
        await storage.deleteCase(caseData.caseId);
      }
      
      // Delete the file record
      const success = await storage.deleteProcessedFile(filename);
      
      if (!success) {
        return res.status(404).json({ error: "File not found" });
      }
      
      res.json({ 
        message: "File and associated cases deleted successfully",
        casesRemoved: casesToDelete.length
      });
    } catch (error) {
      res.status(500).json({ error: `Failed to delete file: ${(error as Error).message}` });
    }
  });
  
  // Helper function to extract fields with different possible names
  function extractField(row: any, possibleNames: string[]): string | null {
    for (const name of possibleNames) {
      if (row[name] !== undefined) {
        return String(row[name]);
      }
    }
    
    // Try case-insensitive match
    const keys = Object.keys(row);
    for (const name of possibleNames) {
      const matchingKey = keys.find(key => key.toLowerCase() === name.toLowerCase());
      if (matchingKey && row[matchingKey] !== undefined) {
        return String(row[matchingKey]);
      }
    }
    
    return null;
  }

  const httpServer = createServer(app);
  return httpServer;
}
