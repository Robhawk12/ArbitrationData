import { read, utils, WorkBook, WorkSheet } from 'xlsx';

interface StandardizedField {
  field: string;
  possibleNames: string[];
  required: boolean;
}

// Define mapping of standard fields to possible Excel column names
export const standardFields: StandardizedField[] = [
  { field: 'caseId', possibleNames: ['case_id', 'caseid', 'case #', 'case number', 'id', 'case_number', 'case id', 'case.id'], required: true },
  { field: 'arbitratorName', possibleNames: ['arbitrator', 'arbitrator name', 'arbitratorname', 'arbitrator_name', 'arbitrator_assigned', 'arbitrator assigned', 'adjudicator', 'neutral'], required: false },
  { field: 'respondentName', possibleNames: ['respondent', 'respondent name', 'respondentname', 'respondent_name', 'defendant', 'business', 'business name', 'business_name', 'company', 'company name', 'nonconsumer'], required: false },
  { field: 'consumerAttorney', possibleNames: ['consumer attorney', 'consumerattorney', 'consumer_attorney', 'claimant attorney', 'claimant_attorney', 'name_consumer_attorney', 'attorney name', 'attorney_name'], required: false },
  { field: 'filingDate', possibleNames: ['filing date', 'filingdate', 'filing_date', 'date filed', 'date_filed', 'date', 'initiated', 'initiated on', 'date initiated', 'submission date'], required: false },
  { field: 'disposition', possibleNames: ['disposition', 'outcome', 'result', 'award_or_outcome', 'award or outcome', 'resolution', 'status', 'case_status', 'case status'], required: false },
  { field: 'claimAmount', possibleNames: ['claim amount', 'claimamount', 'claim_amount', 'claim', 'amount claimed', 'amount_claimed', 'disputed amount', 'amount in dispute'], required: false },
  { field: 'awardAmount', possibleNames: ['award', 'award amount', 'awardamount', 'award_amount', 'amount', 'consumer award', 'award total', 'total award', 'monetary relief'], required: false },
];

// Read an Excel file buffer and return structured data
export async function parseExcelBuffer(buffer: ArrayBuffer): Promise<any[]> {
  try {
    const workbook = read(buffer);
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    
    // Convert to JSON with header row
    const jsonData = utils.sheet_to_json(worksheet);
    return jsonData;
  } catch (error) {
    console.error('Error parsing Excel buffer:', error);
    throw new Error('Invalid Excel file format');
  }
}

// Extract a field value using possible column names
export function extractField(row: any, possibleNames: string[]): string | null {
  // Try exact match first
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

// Detect if a file is likely AAA or JAMS based on content and filename
export function detectFileSource(fileName: string, sampleData: any[]): 'AAA' | 'JAMS' {
  // Check filename first
  if (fileName.toLowerCase().includes('aaa')) {
    return 'AAA';
  }
  
  if (fileName.toLowerCase().includes('jams')) {
    return 'JAMS';
  }
  
  // Check content patterns if available
  if (sampleData && sampleData.length > 0) {
    const firstRow = sampleData[0];
    
    // Look for indicators in the data structure
    const keys = Object.keys(firstRow).map(k => k.toLowerCase());
    
    // AAA typically includes these terms
    if (keys.some(k => k.includes('aaa') || k.includes('american arbitration'))) {
      return 'AAA';
    }
    
    // JAMS typically includes these terms
    if (keys.some(k => k.includes('jams') || k.includes('judicial arbitration'))) {
      return 'JAMS';
    }
  }
  
  // Default to AAA if we can't determine
  return 'AAA';
}

// Identify potential duplicates by case ID or other fields
export function identifyDuplicates(data: any[], existingData: any[]): { 
  duplicates: any[],
  newRecords: any[] 
} {
  const duplicates: any[] = [];
  const newRecords: any[] = [];
  
  // Create a set of existing case IDs for quick lookup
  const existingCaseIds = new Set(existingData.map(record => record.caseId?.toLowerCase()));
  
  // Process each row
  data.forEach(row => {
    const caseId = extractField(row, standardFields.find(f => f.field === 'caseId')?.possibleNames || []);
    
    if (caseId && existingCaseIds.has(caseId.toLowerCase())) {
      duplicates.push(row);
    } else {
      newRecords.push(row);
    }
  });
  
  return { duplicates, newRecords };
}

// Clean and standardize data fields
export function standardizeRecord(row: any, source: 'AAA' | 'JAMS'): Record<string, any> {
  const standardized: Record<string, any> = {
    forum: source
  };
  
  // Process each standard field
  standardFields.forEach(({ field, possibleNames }) => {
    let value = extractField(row, possibleNames);
    
    // Apply field-specific cleaning
    if (field === 'filingDate' && value) {
      // Try to parse date - handle different formats
      try {
        const date = new Date(value);
        if (!isNaN(date.getTime())) {
          value = date.toISOString();
        }
      } catch (e) {
        // Keep original if parsing fails
      }
    }
    
    if (field === 'awardAmount' && value) {
      // Clean and standardize monetary values
      const numericValue = value.replace(/[^0-9.-]+/g, "");
      if (!isNaN(parseFloat(numericValue))) {
        value = numericValue;
      }
    }
    
    // Trim strings
    if (typeof value === 'string') {
      value = value.trim();
    }
    
    standardized[field] = value;
  });
  
  return standardized;
}

// Check for potential data quality issues
export function checkDataQuality(record: Record<string, any>): {
  hasDiscrepancies: boolean;
  missingFields: string[];
} {
  const missingFields = standardFields
    .filter(f => f.required && !record[f.field])
    .map(f => f.field);
  
  return {
    hasDiscrepancies: missingFields.length > 0,
    missingFields
  };
}
