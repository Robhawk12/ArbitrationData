import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import multer from "multer";
import { read, utils } from "xlsx";
import path from "path";

// Extend Express Request type to include multer file
declare global {
  namespace Express {
    interface Request {
      file?: Express.Multer.File;
    }
  }
}
import { insertArbitrationCaseSchema, insertProcessedFileSchema } from "@shared/schema";
import { z } from "zod";

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB limit (to accommodate 20MB+ files)
  },
  fileFilter: (_req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
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
      const isJAMS = fileName.toLowerCase().includes('jams');
      // If JAMS in filename, use that, otherwise default to AAA (there are only two forum types)
      const fileType = isJAMS ? "JAMS" : "AAA";
      const priority = (fileType === "AAA") ? 1 : 2; // AAA has highest priority
      
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
      const jsonData = utils.sheet_to_json(worksheet) as Record<string, any>[];
      
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
        fileType: fileType,
        status: "PROCESSING"
      });
      
      // Process and standardize data
      let recordsProcessed = 0;
      let duplicatesFound = 0;
      let discrepanciesFound = 0;
      
      for (const row of jsonData) {
        try {
          // Cast row to Record<string, any> for type safety
          const rowObj = row as Record<string, any>;
          
          // Extract and standardize fields
          // Enhanced approach with more possible field names
          let caseId;
          
          // For JAMS files, prioritize "Refno" column for case_id
          if (fileType === "JAMS") {
            caseId = extractField(rowObj, ['refno', 'ref no', 'ref_no', 'reference number', 'referencenumber', 'reference_number']) || 
                      extractField(rowObj, ['case_id', 'caseid', 'case #', 'case number', 'id', 'case_number', 'case id', 'case.id']) || 
                      `${fileType}-${Date.now()}-${recordsProcessed}`;
          } else {
            // For AAA files, use standard case_id field names
            caseId = extractField(rowObj, ['case_id', 'caseid', 'case #', 'case number', 'id', 'case_number', 'case id', 'case.id']) || 
                      `${fileType}-${Date.now()}-${recordsProcessed}`;
          }
          
          const forum = fileType;
          
          // More comprehensive field mapping for AAA and JAMS formats
          const arbitratorName = extractField(rowObj, [
            'arbitrator', 'arbitrator name', 'arbitratorname', 'arbitrator_name', 
            'arbitrator_assigned', 'arbitrator assigned', 'adjudicator', 'neutral'
          ]);
          
          // For AAA files specifically, the nonconsumer is the Respondent (Column A)
          // We prioritize 'nonconsumer' and related fields when looking for the respondent
          const respondentFields = [
            'nonconsumer', 'non-consumer', 'non consumer', 'non_consumer', 
            'business', 'business name', 'business_name', 'company', 'company name',
            'respondent', 'respondent name', 'respondentname', 'respondent_name', 'defendant'
          ];
          
          // For consumer, we focus on consumer-related fields and avoid using "claimant"
          const consumerFields = [
            'consumer', 'consumer name', 'consumer_name', 'customer', 'customer name',
            'plaintiff'
          ];

          // Get consumer attorney information
          const consumerAttorney = extractField(rowObj, [
            'name_consumer_attorney', 'consumer_attorney', 'consumer attorney',
            'claimant attorney', 'claimant_attorney', 'attorney_name', 'attorney name'
          ]);
          
          // Extract respondent name (primarily focusing on business/non-consumer entity)
          let respondentName = extractField(rowObj, respondentFields);
          
          // Parse filing date - handles multiple formats
          const filingDateRaw = extractField(rowObj, [
            'filing date', 'filingdate', 'filing_date', 'date filed', 'date_filed', 
            'date', 'initiated', 'initiated on', 'date initiated', 'submission date'
          ]);
          
          // Handle date parsing safely
          let filingDate = null;
          if (filingDateRaw) {
            try {
              // First try to parse the date normally
              const parsedDate = new Date(filingDateRaw);
              
              // Check if the date is valid and within reasonable range (between 1900 and 2100)
              if (!isNaN(parsedDate.getTime()) && 
                  parsedDate.getFullYear() >= 1900 && 
                  parsedDate.getFullYear() <= 2100) {
                filingDate = parsedDate;
              } else {
                // Date is invalid or out of reasonable range
                console.log(`Invalid date value: ${filingDateRaw} - out of reasonable range`);
              }
            } catch (error) {
              console.log(`Error parsing date: ${filingDateRaw} - ${error}`);
            }
          }
          
          // For disposition, make sure to include "Result" for JAMS files
          const disposition = extractField(rowObj, [
            'disposition', 'outcome', 'result', 'Result', 'award_or_outcome', 'award or outcome', 
            'resolution', 'status', 'case_status', 'case status'
          ]);
          
          // Extract and aggregate claim amounts (CLAIM_AMT_CONSUMER + CLAIM_AMT_BUSINESS)
          const claimAmtConsumer = extractField(rowObj, [
            'claim_amt_consumer', 'claimamtconsumer', 'claim amt consumer', 'consumer claim', 
            'consumer claim amount'
          ]);
          
          const claimAmtBusiness = extractField(rowObj, [
            'claim_amt_business', 'claimamtbusiness', 'claim amt business', 'business claim', 
            'business claim amount'
          ]);
          
          // Also check generic claim amount fields as fallback
          const genericClaimAmount = extractField(rowObj, [
            'claim amount', 'claimamount', 'claim_amount', 'claim', 'amount claimed', 
            'amount_claimed', 'disputed amount', 'amount in dispute', 'initial demand'
          ]);
          
          // Calculate total claim amount by combining consumer and business claims
          let claimAmount = null;
          const consumerClaimNum = claimAmtConsumer ? parseFloat(claimAmtConsumer.replace(/[^0-9.-]+/g, "")) : 0;
          const businessClaimNum = claimAmtBusiness ? parseFloat(claimAmtBusiness.replace(/[^0-9.-]+/g, "")) : 0;
          
          if (!isNaN(consumerClaimNum) || !isNaN(businessClaimNum)) {
            // Use the sum if we have either valid consumer or business claim
            const validConsumerClaim = !isNaN(consumerClaimNum) ? consumerClaimNum : 0;
            const validBusinessClaim = !isNaN(businessClaimNum) ? businessClaimNum : 0;
            claimAmount = (validConsumerClaim + validBusinessClaim).toString();
          } else if (genericClaimAmount) {
            // Fallback to generic claim amount if provided
            claimAmount = genericClaimAmount;
          }
          
          // Extract and aggregate award amounts (AWARD_AMT_CONSUMER + AWARD_AMT_BUSINESS)
          const awardAmtConsumer = extractField(rowObj, [
            'award_amt_consumer', 'awardamtconsumer', 'award amt consumer', 'consumer award', 
            'consumer award amount'
          ]);
          
          const awardAmtBusiness = extractField(rowObj, [
            'award_amt_business', 'awardamtbusiness', 'award amt business', 'business award', 
            'business award amount'
          ]);
          
          // Also check generic award amount fields as fallback
          const genericAwardColumns = [
            'award', 'award amount', 'awardamount', 'award_amount', 'amount', 
            'award total', 'total award', 'monetary relief',
            'monetary award', 'damages', 'compensation'
          ];
          
          const genericAwardAmount = extractField(rowObj, genericAwardColumns);
          
          // Calculate total award amount by combining consumer and business awards
          let awardAmount = null;
          const consumerAwardNum = awardAmtConsumer ? parseFloat(awardAmtConsumer.replace(/[^0-9.-]+/g, "")) : 0;
          const businessAwardNum = awardAmtBusiness ? parseFloat(awardAmtBusiness.replace(/[^0-9.-]+/g, "")) : 0;
          
          if (!isNaN(consumerAwardNum) || !isNaN(businessAwardNum)) {
            // Use the sum if we have either valid consumer or business award
            const validConsumerAward = !isNaN(consumerAwardNum) ? consumerAwardNum : 0;
            const validBusinessAward = !isNaN(businessAwardNum) ? businessAwardNum : 0;
            awardAmount = (validConsumerAward + validBusinessAward).toString();
          } else if (genericAwardAmount) {
            // Fallback to generic award amount if provided
            awardAmount = genericAwardAmount;
          }
          
          // If still no award found, search for any award-related columns
          if (!awardAmount) {
            let totalAward = 0;
            let foundAward = false;
            
            // Look for any award-related columns and sum their values
            const rowAsRecord = row as Record<string, any>;
            const rowKeys = Object.keys(rowAsRecord);
            
            for (const key of rowKeys) {
              const keyLower = key.toLowerCase();
              if (keyLower.includes('award') || keyLower.includes('damage') || keyLower.includes('compensation')) {
                const value = rowAsRecord[key];
                if (value) {
                  // Try to extract numeric value
                  const numericValue = String(value).replace(/[^0-9.-]+/g, "");
                  if (!isNaN(parseFloat(numericValue))) {
                    totalAward += parseFloat(numericValue);
                    foundAward = true;
                  }
                }
              }
            }
            
            if (foundAward) {
              awardAmount = totalAward.toString();
            }
          } else {
            // Clean existing award amount to ensure it's numeric
            const numericValue = awardAmount.replace(/[^0-9.-]+/g, "");
            if (!isNaN(parseFloat(numericValue))) {
              awardAmount = numericValue;
            }
          }
          
          // Check for duplicates
          const existingCase = await storage.getCaseById(caseId);
          
          if (existingCase) {
            duplicatesFound++;
            
            // Insert as duplicate but reference original
            await storage.createCase({
              caseId: `${caseId}-dup-${duplicatesFound}`,
              forum,
              arbitratorName,
              respondentName,
              consumerAttorney,
              filingDate,
              disposition,
              claimAmount,
              awardAmount,
              sourceFile: fileName,
              duplicateOf: caseId,
              hasDiscrepancies: false,
              rawData: JSON.stringify(row)
            });
            
            continue;
          }
          
          // Track discrepancies (missing critical data)
          const hasDiscrepancies = !arbitratorName || !respondentName || !filingDate || !disposition;
          if (hasDiscrepancies) {
            discrepanciesFound++;
          }
          
          // Create case record
          await storage.createCase({
            caseId,
            forum,
            arbitratorName,
            respondentName,
            consumerAttorney,
            filingDate,
            disposition,
            claimAmount,
            awardAmount,
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
  
  // Enhanced helper function to extract fields with different possible names
  function extractField(row: Record<string, any>, possibleNames: string[]): string | null {
    // Try direct exact match first
    for (const name of possibleNames) {
      if (row[name] !== undefined) {
        return String(row[name]);
      }
    }
    
    // Try case-insensitive exact match
    const keys = Object.keys(row);
    for (const name of possibleNames) {
      const matchingKey = keys.find(key => key.toLowerCase() === name.toLowerCase());
      if (matchingKey && row[matchingKey] !== undefined) {
        return String(row[matchingKey]);
      }
    }
    
    // Try fuzzy matching - look for keys that contain our search terms
    for (const name of possibleNames) {
      // Skip very short names (less than 4 chars) to avoid false matches
      if (name.length < 4) continue;
      
      const nameLower = name.toLowerCase();
      // Find keys that contain our search term
      const fuzzyMatch = keys.find(key => {
        const keyLower = key.toLowerCase();
        return keyLower.includes(nameLower) || nameLower.includes(keyLower);
      });
      
      if (fuzzyMatch && row[fuzzyMatch] !== undefined) {
        return String(row[fuzzyMatch]);
      }
    }
    
    // Advanced match for column headers that might have spaces, underscores, etc.
    for (const name of possibleNames) {
      // Skip very short names to avoid false matches
      if (name.length < 4) continue;
      
      // Normalize the search term - remove spaces, underscores, etc.
      const normalizedName = name.toLowerCase().replace(/[_\s-]/g, '');
      
      const advancedMatch = keys.find(key => {
        const normalizedKey = key.toLowerCase().replace(/[_\s-]/g, '');
        return normalizedKey.includes(normalizedName) || normalizedName.includes(normalizedKey);
      });
      
      if (advancedMatch && row[advancedMatch] !== undefined) {
        return String(row[advancedMatch]);
      }
    }
    
    return null;
  }

  const httpServer = createServer(app);
  return httpServer;
}
