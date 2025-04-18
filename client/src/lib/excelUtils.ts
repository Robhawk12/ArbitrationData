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
  // First check filename for obvious indicators
  const filenameLower = fileName.toLowerCase();
  if (filenameLower.includes('aaa') || filenameLower.includes('american arbitration')) {
    return 'AAA';
  }
  if (filenameLower.includes('jams')) {
    return 'JAMS';
  }
  
  // If filename doesn't provide a clear answer, check the data
  if (sampleData && sampleData.length > 0) {
    // Get all keys for analysis from the first few rows
    const rowsToCheck = Math.min(3, sampleData.length);
    const allKeys = new Set<string>();
    
    for (let i = 0; i < rowsToCheck; i++) {
      if (sampleData[i]) {
        Object.keys(sampleData[i]).forEach(key => allKeys.add(key));
      }
    }
    
    const keys = Array.from(allKeys);
    const keysUpper = keys.map(k => k.toUpperCase());
    
    // Check for AAA-specific column patterns
    if (keys.some(k => k.toUpperCase() === 'NONCONSUMER') || 
        keys.some(k => k.toUpperCase() === 'NAME_CONSUMER_ATTORNEY')) {
      console.log("Detected AAA file by column patterns");
      return 'AAA';
    }
    
    // Check for JAMS-specific column patterns
    // For JAMS files, check for column names like REFNO, RESULT, etc.
    // Handle cases where column names have linebreaks or footnotes
    const jamsIndicators = [
      'REFNO', 
      'ARBITRATOR NAME', 
      'CONSUMER ATTORNEY',
      'RESULT',
      'CLAIM AMOUNT',
      'AWARD AMOUNT'
    ];
    
    // Check for column names that match JAMS patterns
    // Handle variations with linebreaks and whitespace
    const normalizedKeys = keys.map(k => k.replace(/\r?\n/g, ' ').toUpperCase().trim());
    
    const hasJamsColumns = jamsIndicators.some(indicator => 
      normalizedKeys.some(key => key.includes(indicator))
    );
    
    if (hasJamsColumns) {
      console.log("Detected JAMS file by column patterns");
      return 'JAMS';
    }
    
    // Check for columns containing "JAMS" or "Judicial Arbitration"
    if (keys.some(k => k.toUpperCase().includes('JAMS')) || 
        keys.some(k => k.toUpperCase().includes('JUDICIAL ARBITRATION'))) {
      console.log("Detected JAMS file by company name in columns");
      return 'JAMS';
    }
    
    // Check for REFNO column which is specific to JAMS files
    for (const row of sampleData.slice(0, rowsToCheck)) {
      if (row['REFNO'] !== undefined || 
          row['Refno'] !== undefined || 
          row['refno'] !== undefined) {
        console.log("Detected JAMS file by REFNO column");
        return 'JAMS';
      }
    }
  }
  
  // Default to JAMS if we can't determine for this file since it's more common
  console.log("Couldn't determine file source, defaulting to JAMS");
  return 'JAMS';
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
