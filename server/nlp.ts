import { db } from "./db";
import { sql } from "drizzle-orm";
import { arbitrationCases } from "../shared/schema";
import { analyzeQueryWithAI, generateComplexQueryResponse, generateSQLForQuery } from "./openai";

/**
 * Parses a name into its components for advanced matching
 * @param name Full name to parse
 * @returns Object with parsed name components
 */
function parseNameComponents(name: string): { 
  firstName: string | null; 
  middleInitial: string | null; 
  lastName: string | null;
} {
  if (!name) return { firstName: null, middleInitial: null, lastName: null };
  
  // Remove common titles and suffixes
  const cleanName = name.replace(/^(Hon\.|Honorable|Judge|Justice|Dr\.|Professor|Prof\.|Mr\.|Mrs\.|Ms\.|Mx\.)\s+/i, '')
                        .replace(/\s+(Esq\.|Sr\.|Jr\.|I|II|III|IV|V|MD|PhD|JD|DDS)\.?$/i, '');
  
  // Remove any extra spaces and split the name
  const nameParts = cleanName.trim().split(/\s+/);
  
  // If only one word, assume it's a last name
  if (nameParts.length === 1) {
    return { firstName: null, middleInitial: null, lastName: nameParts[0] };
  }
  
  // Extract last name (always assumed to be the last part)
  const lastName = nameParts[nameParts.length - 1];
  
  // Extract first name (always assumed to be the first part)
  const firstName = nameParts[0];
  
  // Check for middle initial (if name has more than 2 parts)
  let middleInitial = null;
  if (nameParts.length > 2) {
    // Check if middle part is an initial (one letter followed by a period or just one letter)
    const middlePart = nameParts[1];
    if (middlePart.length === 1 || (middlePart.length === 2 && middlePart.endsWith('.'))) {
      middleInitial = middlePart.charAt(0);
    }
  }
  
  return { firstName, middleInitial, lastName };
}

/**
 * Determines if two names match according to the specified rules:
 * 1. Match by last name first
 * 2. Then match by first name
 * 3. Names with a middle initial are considered a match with names without a middle initial
 * 4. Names with different middle initials are not considered a match
 * 
 * @param name1 First name to compare
 * @param name2 Second name to compare
 * @returns True if names match according to rules, false otherwise
 * 
 * NOTE: Always applies standardizeName() before comparing to ensure consistency
 */
function doNamesMatch(name1: string, name2: string): boolean {
  // First standardize both names to have consistent formatting
  const standardizedName1 = standardizeName(name1);
  const standardizedName2 = standardizeName(name2);
  
  // Now parse the standardized names into components for comparison
  const name1Components = parseNameComponents(standardizedName1);
  const name2Components = parseNameComponents(standardizedName2);
  
  // First, check if last names match (case insensitive)
  if (!name1Components.lastName || !name2Components.lastName) return false;
  
  const lastNamesMatch = name1Components.lastName.toLowerCase() === name2Components.lastName.toLowerCase();
  if (!lastNamesMatch) return false;
  
  // If last names match but either name doesn't have a first name, consider it a match
  if (!name1Components.firstName || !name2Components.firstName) return true;
  
  // Check if first names match (case insensitive)
  const firstNamesMatch = name1Components.firstName.toLowerCase() === name2Components.firstName.toLowerCase();
  if (!firstNamesMatch) return false;
  
  // If we have different middle initials, it's not a match
  if (name1Components.middleInitial && name2Components.middleInitial && 
      name1Components.middleInitial.toLowerCase() !== name2Components.middleInitial.toLowerCase()) {
    return false;
  }
  
  // If we got here, the names match according to our rules
  return true;
}

// Define the types of questions the system can handle
const QUERY_TYPES = {
  // Arbitrator-focused queries
  ARBITRATOR_CASE_COUNT: "arbitrator_case_count",
  ARBITRATOR_OUTCOME_ANALYSIS: "arbitrator_outcome_analysis", 
  ARBITRATOR_AVERAGE_AWARD: "arbitrator_average_award",
  ARBITRATOR_CASE_LISTING: "arbitrator_case_listing",
  
  // Respondent-focused queries
  RESPONDENT_CASE_COUNT: "respondent_case_count",
  RESPONDENT_OUTCOME_ANALYSIS: "respondent_outcome_analysis",
  
  // Combined queries (arbitrator + respondent)
  COMBINED_OUTCOME_ANALYSIS: "combined_outcome_analysis",
  
  // Comparative analysis of all arbitrators
  ARBITRATOR_RANKING: "arbitrator_ranking",
  
  // Time-based queries
  TIME_BASED_ANALYSIS: "time_based_analysis",
  
  // Complex queries requiring AI assistance
  COMPLEX_ANALYSIS: "complex_analysis",
  
  // Unknown query
  UNKNOWN: "unknown",
};

/**
 * Extract arbitrator name from a query using patterns specific to arbitrator roles
 * @param query The query text
 * @returns The extracted arbitrator name or null if not found
 */
function extractArbitratorName(query: string): string | null {
  // Look for specific patterns first (these are most likely to be accurate)
  const specificPatterns = [
    // "by John Smith"
    /(?:by|for|from|about|handled by)\s+([A-Za-z\s\.\-']+?)(?:[,\.\?]|\s+(?:has|have|handled|cases|with|against|and|or|in|the|is|was|did)|$)/i,
    // "John Smith's cases"
    /([A-Za-z\s\.\-']+?)(?:'s cases)/i,
    // "John Smith has handled"
    /([A-Za-z\s\.\-']+?)(?:\s+has handled)/i,
    // "John Smith ruled"
    /([A-Za-z\s\.\-']+?)(?:\s+ruled)/i,
    // "arbitrator John Smith"
    /arbitrator\s+([A-Za-z\s\.\-']+?)(?:[,\.\?]|$)/i,
    // "cases by John Smith"
    /cases\s+(?:by|of|from|with)\s+([A-Za-z\s\.\-']+?)(?:[,\.\?]|$)/i,
  ];
  
  for (const pattern of specificPatterns) {
    const match = query.match(pattern);
    if (match && match[1]) {
      const name = match[1].trim();
      // If name length is reasonable (to avoid matching entire sentences)
      if (name.length > 1 && name.length < 40) {
        // Clean the name by removing titles and suffixes
        return cleanNameString(name);
      }
    }
  }
  
  // Direct name recognition for simple queries
  // Match "How many cases has Smith handled?" or "How many cases has Bradley Areheart handled?"
  const simplePatterns = [
    /has\s+([A-Za-z\s\.\-']+?)\s+handled/i,
    /did\s+([A-Za-z\s\.\-']+?)\s+handle/i,
    /for\s+([A-Za-z\s\.\-']+?)(?:[,\.\?]|\s|$)/i
  ];
  
  for (const pattern of simplePatterns) {
    const match = query.match(pattern);
    if (match && match[1]) {
      return cleanNameString(match[1].trim());
    }
  }
  
  // Last resort: look for capitalized words or sequences that might be names
  const words = query.split(/\s+/);
  for (let i = 0; i < words.length; i++) {
    // Check if word starts with capital letter or is a title (potential name component)
    if (/^[A-Z][a-z\.\-']*$/.test(words[i]) || 
        /^(Hon\.|Honorable|Judge|Justice|Dr\.|Professor|Prof\.|Mr\.|Mrs\.|Ms\.|Mx\.)$/i.test(words[i])) {
      
      // Try to capture the full name with potential titles
      let fullName = "";
      let j = i;
      
      // Keep adding words as long as they start with a capital letter or are titles/prefixes
      while (j < words.length && 
            (/^[A-Z]/.test(words[j]) || // Starts with capital letter
             /^(Hon\.|Honorable|Judge|Justice|Dr\.|Professor|Prof\.|Mr\.|Mrs\.|Ms\.|Mx\.)$/i.test(words[j]))) { // Is a title
        fullName += (fullName ? " " : "") + words[j];
        j++;
      }
      
      if (fullName) {
        return cleanNameString(fullName);
      }
    }
  }
  
  return null;
}

/**
 * Standardizes a person's name using consistent rules:
 * 1. Removes title prefixes (Hon., Dr., Mr., etc.)
 * 2. Removes suffixes (Esq., Jr., III, etc.)
 * 3. Converts full middle names to initials (John Edward Smith → John E. Smith)
 * 4. Properly formats initials with periods
 * 5. Preserves capitalization pattern
 * 
 * @param name The name to standardize
 * @returns The standardized name
 */
function standardizeName(name: string): string {
  if (!name) return name;
  
  // Step 1: Trim and remove excess whitespace
  name = name.trim().replace(/\s+/g, ' ');
  
  // Step 2: Remove title prefixes (using a more comprehensive list)
  name = name.replace(/^(Hon\.|Honorable|Judge|Justice|Dr\.|Doctor|Professor|Prof\.|Mr\.|Mrs\.|Ms\.|Miss|Mx\.|Sir|Madam|Dame)\s+/i, '');
  
  // Step 3: Remove suffixes
  name = name.replace(/\s+(Esq\.|Esquire|Sr\.|Senior|Jr\.|Junior|I|II|III|IV|V|MD|PhD|JD|DDS|CPA|MBA)\.?$/i, '');
  
  // Step 4: Split the name into parts
  const nameParts = name.split(/\s+/);
  
  // If there are fewer than 3 parts, no middle name to process
  if (nameParts.length < 3) {
    return name;
  }
  
  // Step 5: Extract first name and last name
  const firstName = nameParts[0];
  const lastName = nameParts[nameParts.length - 1];
  
  // Step 6: Process middle parts
  const middleParts = nameParts.slice(1, nameParts.length - 1);
  
  // Step 7: Convert middle names to initials
  const middleInitials = middleParts.map(part => {
    // Skip short connecting words
    if (/^(de|la|van|von|der|del|of|the)$/i.test(part)) {
      return part.toLowerCase();
    }
    
    // If already an initial (with or without period), standardize format without period
    // This ensures "Dwight L. Smith" and "Dwight L Smith" are treated as the same person
    if (/^[A-Z]\.?$/i.test(part)) {
      return part.charAt(0).toUpperCase();
    }
    
    // Convert full name to initial without period
    return part.charAt(0).toUpperCase();
  });
  
  // Step 8: Rejoin all parts
  return [firstName, ...middleInitials, lastName].join(' ');
}

/**
 * Legacy function maintained for backward compatibility
 * @param name The name to clean
 * @returns The standardized name
 */
function cleanNameString(name: string): string {
  return standardizeName(name);
}

/**
 * Legacy function maintained for backward compatibility
 * @param name The name to standardize
 * @returns The name with middle names converted to initials
 */
function standardizeMiddleName(name: string): string {
  return standardizeName(name);
}

/**
 * Extract respondent name from a query and standardize it
 * @param query The query text
 * @returns The extracted and standardized respondent name or null if not found
 */
function extractRespondentName(query: string): string | null {
  // Common respondent name extraction patterns
  const patterns = [
    // Special patterns for "cases for X as respondent" - this needs to be first to catch it correctly
    /(?:list|show)?\s*cases?\s+for\s+([A-Za-z0-9\s\.\-&']+?)\s+as\s+respondent/i,
    
    // Generic pattern for "list cases for X"
    /(?:list|show)\s+cases?\s+for\s+([A-Za-z0-9\s\.\-&']+?)(?:[,\.\?]|$|\s+(?:and|or|in|the))/i,
    
    // Explicit patterns for "respondent" keyword
    /(?:respondent|company)\s+([A-Za-z0-9\s\.\-&']+?)(?:[,\.\?]|\s+(?:as|and|or|in|the|by|with)|$)/i,
    /respondent\s+(?:is|was|named)\s+([A-Za-z0-9\s\.\-&']+?)(?:[,\.\?]|$)/i,
    
    // Patterns for specific prepositions
    /(?:against|involving|with|by|for)\s+([A-Za-z0-9\s\.\-&']+?)(?:[,\.\?]|\s+(?:as|and|or|in|the|respondent|company|corporation|inc|llc|ltd)|$)/i,
    
    // Pattern for company names with corp/inc/llc suffix
    /([A-Za-z0-9\s\.\-&']+?(?:\s+(?:Corp|Inc|LLC|Ltd|Corporation|Company)))/i,
    
    // Patterns for outcomes phrasing
    /outcomes\s+(?:for|of|by)\s+([A-Za-z0-9\s\.\-&']+?)(?:[,\.\?]|$)/i,
    /([A-Za-z0-9\s\.\-&']+?)\s+(?:as respondent)/i
  ];
  
  for (const pattern of patterns) {
    const match = query.match(pattern);
    if (match && match[1]) {
      const name = match[1].trim();
      // Skip common words that might be falsely matched
      if (name.toLowerCase() === "the" || 
          name.toLowerCase() === "a" || 
          name.toLowerCase() === "an" ||
          name.length < 3) {
        continue;
      }
      
      // For respondent names, apply standardization to ensure consistent matching
      return standardizeName(name);
    }
  }
  
  return null;
}

/**
 * Extract timeframe information from a query
 * @param query The query text to analyze
 * @returns Object with year and/or timeframe information, or null if not found
 */
function extractTimeframe(query: string): { year: number | null; timeframe: string | null } | null {
  console.log(`Extracting timeframe from query: "${query}"`);
  const lowerQuery = query.toLowerCase();
  let year = null;
  let timeframe = null;
  
  // Check for specific years
  const yearPattern = /\b(19|20)\d{2}\b/g;
  const yearMatches = lowerQuery.match(yearPattern);
  
  console.log(`Year pattern matches:`, yearMatches);
  
  if (yearMatches && yearMatches.length > 0) {
    year = parseInt(yearMatches[0], 10);
    timeframe = yearMatches[0];
    console.log(`Found year ${year} in query`);
    return { year, timeframe };
  }
  
  // Check for phrases like "last year", "this year", etc.
  const currentYear = new Date().getFullYear();
  
  if (lowerQuery.includes("last year")) {
    year = currentYear - 1;
    timeframe = "last year";
    console.log(`Query refers to last year (${year})`);
    return { year, timeframe };
  }
  
  if (lowerQuery.includes("this year")) {
    year = currentYear;
    timeframe = "this year";
    console.log(`Query refers to this year (${year})`);
    return { year, timeframe };
  }
  
  if (lowerQuery.includes("past 5 years") || lowerQuery.includes("last 5 years")) {
    timeframe = "past 5 years";
    console.log(`Query refers to past 5 years`);
    return { year, timeframe };
  }
  
  // If we couldn't extract any time information
  console.log(`No timeframe found in query`);
  return null;
}

/**
 * Checks if a query contains both arbitrator and respondent references
 * @param query The query text to analyze
 * @returns An object containing extracted arbitrator and respondent names, or null if not found
 */
function extractCombinedQuery(query: string): { arbitratorName: string | null; respondentName: string | null } | null {
  const lowerQuery = query.toLowerCase();
  
  // Check if the query has indicators of a combined question about arbitrator and respondent
  const hasCombinedIndicators = 
    (lowerQuery.includes("rule") || 
     lowerQuery.includes("ruled") || 
     lowerQuery.includes("decision") || 
     lowerQuery.includes("decide")) &&
    (lowerQuery.includes("against") || 
     lowerQuery.includes("for") || 
     lowerQuery.includes("involving") || 
     lowerQuery.includes("with") ||
     lowerQuery.includes("between"));
  
  if (!hasCombinedIndicators) return null;
  
  // Try to extract both names
  const arbitratorName = extractArbitratorName(query);
  const respondentName = extractRespondentName(query);
  
  // Only return a match if we found both names
  if (arbitratorName && respondentName) {
    return { arbitratorName, respondentName };
  }
  
  return null;
}

/**
 * Analyzes a natural language query to determine the type of question being asked
 * @param query The natural language query from the user
 */
async function analyzeQuery(query: string): Promise<{
  type: string;
  parameters: Record<string, string | null>;
}> {
  try {
    console.log("Analyzing query:", query);
    const lowerQuery = query.toLowerCase();
    let type = QUERY_TYPES.UNKNOWN;
    let arbitratorName = null;
    let respondentName = null;
    let disposition = null;
    let caseType = null;
    let year = null;
    let timeframe = null;
    
    // Extract timeframe information if present in the query
    const timeframeInfo = extractTimeframe(query);
    if (timeframeInfo) {
      year = timeframeInfo.year?.toString() || null;
      timeframe = timeframeInfo.timeframe;
    }
    
    // Check if this is a time-based query about case dispositions
    const hasTimeIndicator = timeframe || 
                            lowerQuery.includes("year") || 
                            lowerQuery.includes("2020") || 
                            lowerQuery.includes("2019") || 
                            lowerQuery.includes("2018");
    
    console.log(`Has time indicator: ${hasTimeIndicator}, Timeframe: ${timeframe}`);
    
    if (hasTimeIndicator && 
        (lowerQuery.includes("how many") || lowerQuery.includes("number of")) &&
        (lowerQuery.includes("case") || lowerQuery.includes("cases"))) {
      
      console.log("Detected time-based query about cases");
      type = QUERY_TYPES.TIME_BASED_ANALYSIS;
      
      // Extract the disposition type from the query
      if (lowerQuery.includes("award") || lowerQuery.includes("awarded")) {
        disposition = "award";
        console.log("Detected disposition: award");
      } else if (lowerQuery.includes("dismiss") || lowerQuery.includes("dismissed")) {
        disposition = "dismiss";
        console.log("Detected disposition: dismiss");
      } else if (lowerQuery.includes("settle") || lowerQuery.includes("settled")) {
        disposition = "settle";
        console.log("Detected disposition: settle");
      } else if (lowerQuery.includes("withdraw") || lowerQuery.includes("withdrawn")) {
        disposition = "withdraw";
        console.log("Detected disposition: withdraw");
      } else {
        // If no specific disposition is mentioned, the query might be about all cases
        console.log("No specific disposition detected in query");
      }
      
      // Return early with the time-based analysis parameters
      console.log("Analyzed as time-based query with disposition");
      console.log("Parameters:", { year, timeframe, disposition, caseType });
      
      return {
        type,
        parameters: {
          year,
          timeframe,
          disposition,
          caseType,
          arbitratorName,
          respondentName
        },
      };
    }
    
    // First, check if this is a combined query (both arbitrator and respondent)
    const combinedQuery = extractCombinedQuery(query);
    if (combinedQuery) {
      type = QUERY_TYPES.COMBINED_OUTCOME_ANALYSIS;
      arbitratorName = combinedQuery.arbitratorName;
      respondentName = combinedQuery.respondentName;
      
      // We've identified this as a combined query, so return early
      console.log("Analyzed as combined query with both arbitrator and respondent");
      console.log("Parameters:", { arbitratorName, respondentName, disposition, caseType, year, timeframe });
      
      return {
        type,
        parameters: {
          arbitratorName,
          respondentName,
          disposition,
          caseType,
          year,
          timeframe
        },
      };
    }
    
    // How many cases has X handled?
    if (
      (lowerQuery.includes("how many") || lowerQuery.includes("number of")) &&
      (lowerQuery.includes("case") || lowerQuery.includes("cases"))
    ) {
      type = QUERY_TYPES.ARBITRATOR_CASE_COUNT;
      
      // Extract name from "How many cases has [name] handled?"
      const hasPattern = /has\s+((?:Hon\.|Honorable|Judge|Justice|Dr\.|Professor|Prof\.|Mr\.|Mrs\.|Ms\.|Mx\.)?\s*[A-Za-z\s\.\-']+?)\s+(?:handled|overseen|arbitrated|managed)/i;
      const didPattern = /did\s+((?:Hon\.|Honorable|Judge|Justice|Dr\.|Professor|Prof\.|Mr\.|Mrs\.|Ms\.|Mx\.)?\s*[A-Za-z\s\.\-']+?)\s+(?:handle|oversee|arbitrate|manage)/i;
      const byPattern = /(?:by|from|with)\s+((?:Hon\.|Honorable|Judge|Justice|Dr\.|Professor|Prof\.|Mr\.|Mrs\.|Ms\.|Mx\.)?\s*[A-Za-z\s\.\-']+?)(?:[,\.\?]|\s|$)/i;
      
      let match = query.match(hasPattern) || query.match(didPattern) || query.match(byPattern);
      
      if (match && match[1]) {
        arbitratorName = cleanNameString(match[1].trim());
      } else {
        // Last resort: look for capitalized words after common phrases
        const words = query.split(/\s+/);
        for (let i = 0; i < words.length; i++) {
          if (words[i].toLowerCase() === "has" || words[i].toLowerCase() === "by") {
            // Check for full name patterns after keywords
            let fullName = "";
            let j = i + 1;
            
            // Keep adding words as long as they start with a capital letter or are titles/prefixes
            while (j < words.length && 
                  (/^[A-Z]/.test(words[j]) || // Starts with capital letter
                   /^(Hon\.|Honorable|Judge|Justice|Dr\.|Professor|Prof\.|Mr\.|Mrs\.|Ms\.|Mx\.)$/i.test(words[j]))) { // Is a title
              fullName += (fullName ? " " : "") + words[j];
              j++;
            }
            
            if (fullName) {
              arbitratorName = cleanNameString(fullName);
              break;
            }
          }
        }
      }
    }
    
    // What are the outcomes for cases handled by X?
    else if (
      (lowerQuery.includes("outcome") || lowerQuery.includes("result") || lowerQuery.includes("ruling")) &&
      !lowerQuery.includes("average") &&
      !lowerQuery.includes("award amount")
    ) {
      // First, check if query is explicitly about a respondent by looking for specific phrases
      if (lowerQuery.includes(" as respondent") || 
          lowerQuery.includes(" against ") || 
          lowerQuery.includes(" vs ") ||
          lowerQuery.includes(" versus ") ||
          lowerQuery.includes("respondent") ||
          /outcomes\s+for\s+[A-Z]/.test(query)) {  // "outcomes for CompanyName"
        
        type = QUERY_TYPES.RESPONDENT_OUTCOME_ANALYSIS;
        respondentName = extractRespondentName(query);
        
        // Make sure we don't extract arbitrator name for respondent queries
        arbitratorName = null;
      }
      // Explicitly check for arbitrator-specific patterns
      else if (lowerQuery.includes("handled by") || 
               lowerQuery.includes("overseen by") || 
               lowerQuery.includes("arbitrated by") ||
               lowerQuery.includes("arbitrator") ||
               lowerQuery.includes("cases by")) {
        
        type = QUERY_TYPES.ARBITRATOR_OUTCOME_ANALYSIS;
        
        // Extract arbitrator name with the patterns that work
        const byPattern = /(?:handled|overseen|arbitrated|managed)\s+by\s+((?:Hon\.|Honorable|Judge|Justice|Dr\.|Professor|Prof\.|Mr\.|Mrs\.|Ms\.|Mx\.)?\s*[A-Za-z\s\.\-']+?)(?:[,\.\?]|$)/i;
        const forPattern = /outcomes\s+for\s+((?:Hon\.|Honorable|Judge|Justice|Dr\.|Professor|Prof\.|Mr\.|Mrs\.|Ms\.|Mx\.)?\s*[A-Za-z\s\.\-']+?)(?:[,\.\?]|$)/i;
        
        const match = query.match(byPattern) || query.match(forPattern);
        
        if (match && match[1]) {
          arbitratorName = cleanNameString(match[1].trim());
        }
        
        // Make sure we don't extract respondent name for clear arbitrator queries
        respondentName = null;
      }
      // If not clearly identified, try to decide based on context
      else {
        // Default to respondent analysis for less clear cases that mention companies
        type = QUERY_TYPES.RESPONDENT_OUTCOME_ANALYSIS;
        respondentName = extractRespondentName(query);
        
        // Only check for arbitrator if no respondent found
        if (!respondentName) {
          arbitratorName = extractArbitratorName(query);
          if (arbitratorName) {
            type = QUERY_TYPES.ARBITRATOR_OUTCOME_ANALYSIS;
          }
        }
      }
    }
    
    // What is the average award amount given by X?
    else if (
      (lowerQuery.includes("average") || lowerQuery.includes("mean")) &&
      (lowerQuery.includes("award") || lowerQuery.includes("amount") || lowerQuery.includes("damages"))
    ) {
      type = QUERY_TYPES.ARBITRATOR_AVERAGE_AWARD;
      
      // Extract name from "given by [name]" or "awarded by [name]"
      const byPattern = /(?:given|awarded|granted|authorized)\s+by\s+((?:Hon\.|Honorable|Judge|Justice|Dr\.|Professor|Prof\.|Mr\.|Mrs\.|Ms\.|Mx\.)?\s*[A-Za-z\s\.\-']+?)(?:[,\.\?]|$)/i;
      const ofPattern = /(?:award|amount).+?\s+of\s+((?:Hon\.|Honorable|Judge|Justice|Dr\.|Professor|Prof\.|Mr\.|Mrs\.|Ms\.|Mx\.)?\s*[A-Za-z\s\.\-']+?)(?:[,\.\?]|$)/i;
      
      const match = query.match(byPattern) || query.match(ofPattern);
      
      if (match && match[1]) {
        arbitratorName = cleanNameString(match[1].trim());
      }
      
      // Check for disposition in queries like "What is the average award for consumers by X?"
      if (lowerQuery.includes("for consumer")) {
        disposition = "for consumer";
      } else if (lowerQuery.includes("for respondent")) {
        disposition = "for respondent";
      } else if (lowerQuery.includes("for claimant")) {
        disposition = "for claimant";
      }
    }
    
    // List the cases handled by X or involving company Y
    else if (
      (lowerQuery.includes("list") || 
       lowerQuery.includes("show") || 
       lowerQuery.includes("what case") || 
       lowerQuery.includes("which case") ||
       lowerQuery.includes("display"))
    ) {
      // First check if this is about a respondent
      if (lowerQuery.includes("involving") || 
          lowerQuery.includes("with") || 
          lowerQuery.includes("against") || 
          lowerQuery.includes("versus") ||
          lowerQuery.includes(" vs ") ||
          lowerQuery.includes(" for ") ||
          lowerQuery.includes(" as respondent") ||
          /\bcases?\s+for\s+/i.test(query)) {
        
        type = QUERY_TYPES.RESPONDENT_OUTCOME_ANALYSIS;
        respondentName = extractRespondentName(query);
        arbitratorName = null;
      }
      // Otherwise assume it's about an arbitrator
      else {
        type = QUERY_TYPES.ARBITRATOR_CASE_LISTING;
        
        // Extract name from "cases handled by [name]"
        // Make the pattern less greedy to capture multiple words including titles (like Hon.)
        const byPattern = /(?:handled|overseen|arbitrated|managed)\s+by\s+((?:Hon\.|Honorable|Judge|Justice|Dr\.|Professor|Prof\.|Mr\.|Mrs\.|Ms\.|Mx\.)?\s*[A-Za-z\s\.\-']+?)(?:[,\.\?]|$)/i;
        const ofPattern = /(?:cases|arbitrations).+?\s+of\s+((?:Hon\.|Honorable|Judge|Justice|Dr\.|Professor|Prof\.|Mr\.|Mrs\.|Ms\.|Mx\.)?\s*[A-Za-z\s\.\-']+?)(?:[,\.\?]|$)/i;
        
        const match = query.match(byPattern) || query.match(ofPattern);
        
        if (match && match[1]) {
          arbitratorName = cleanNameString(match[1].trim());
        } else {
          // Last resort: look for capitalized words after keywords
          const words = query.split(/\s+/);
          for (let i = 0; i < words.length; i++) {
            if (words[i].toLowerCase() === "by" || words[i].toLowerCase() === "arbitrator") {
              // Check for full name patterns after "by" or "arbitrator"
              let fullName = "";
              let j = i + 1;
              
              // Keep adding words as long as they start with a capital letter or are titles/prefixes
              while (j < words.length && 
                    (/^[A-Z]/.test(words[j]) || // Starts with capital letter
                     /^(Hon\.|Honorable|Judge|Justice|Dr\.|Professor|Prof\.|Mr\.|Mrs\.|Ms\.|Mx\.)$/i.test(words[j]))) { // Is a title
                fullName += (fullName ? " " : "") + words[j];
                j++;
              }
              
              if (fullName) {
                arbitratorName = cleanNameString(fullName);
                break;
              }
            }
          }
        }
      }
    }
    
    // If we didn't extract a name but the query type requires one, try the generic name extractors
    if (!arbitratorName && (
      type === QUERY_TYPES.ARBITRATOR_CASE_COUNT || 
      type === QUERY_TYPES.ARBITRATOR_OUTCOME_ANALYSIS || 
      type === QUERY_TYPES.ARBITRATOR_AVERAGE_AWARD || 
      type === QUERY_TYPES.ARBITRATOR_CASE_LISTING
    )) {
      arbitratorName = extractArbitratorName(query);
    }
    
    if (!respondentName && type === QUERY_TYPES.RESPONDENT_OUTCOME_ANALYSIS) {
      respondentName = extractRespondentName(query);
    }
    
    console.log("Analyzed query type:", type);
    console.log("Parameters:", { arbitratorName, respondentName, disposition, caseType, year, timeframe });
    
    return {
      type,
      parameters: {
        arbitratorName,
        respondentName,
        disposition,
        caseType,
        year,
        timeframe,
      },
    };
  } catch (error) {
    console.error("Error analyzing query:", error);
    return { type: QUERY_TYPES.UNKNOWN, parameters: {} };
  }
}

/**
 * Executes a database query based on the analyzed query type and parameters
 * @param queryType The type of query to execute
 * @param parameters Parameters extracted from the natural language query
 */
async function executeQueryByType(
  queryType: string,
  parameters: Record<string, string | null>
): Promise<{ data: any; message: string }> {
  try {
    const { arbitratorName, respondentName, disposition, caseType, year, timeframe } = parameters;
    
    switch (queryType) {
      case QUERY_TYPES.ARBITRATOR_CASE_COUNT: {
        if (!arbitratorName) {
          return { data: null, message: "No arbitrator name specified in the query." };
        }
        
        // Get all distinct arbitrator names from the database to do advanced name matching
        const allArbitratorNames = await db
          .select({ name: arbitrationCases.arbitratorName })
          .from(arbitrationCases)
          .where(
            // First do a basic filter to narrow down the results
            sql`arbitrator_name IS NOT NULL AND LOWER(arbitrator_name) LIKE LOWER(${'%' + (arbitratorName ? arbitratorName.split(' ').pop() || '' : '') + '%'})`
          )
          .groupBy(arbitrationCases.arbitratorName)
          .execute();
          
        // Find all matching names using our advanced name matching logic
        const matchingNames = allArbitratorNames
          .filter(item => item.name && doNamesMatch(arbitratorName, item.name))
          .map(item => item.name);
          
        if (matchingNames.length === 0) {
          return {
            data: { count: 0 },
            message: `${arbitratorName} has handled 0 arbitration cases.`,
          };
        }
        
        // Get the count for all matching names
        let totalCount = 0;
        const nameStats = [];
        
        for (const name of matchingNames) {
          const result = await db
            .select({ count: sql`COUNT(*)` })
            .from(arbitrationCases)
            .where(sql`arbitrator_name = ${name}`)
            .execute();
            
          const count = Number(result[0]?.count || 0);
          totalCount += count;
          
          nameStats.push({
            name,
            count
          });
        }
        
        // If we found multiple distinct matching names
        if (matchingNames.length > 1) {
          let message = `I found ${matchingNames.length} arbitrators matching "${arbitratorName}" with a total of ${totalCount} cases:\n\n`;
          
          nameStats.sort((a, b) => b.count - a.count); // Sort by count descending
          
          nameStats.forEach((item) => {
            message += `- ${item.name}: ${item.count} cases\n`;
          });
          
          return {
            data: { 
              count: totalCount,
              distinctNames: nameStats
            },
            message: message,
          };
        }
        
        // If we only have one name match
        return {
          data: { count: totalCount },
          message: `${arbitratorName} has handled ${totalCount} arbitration cases.`,
        };
      }
      
      case QUERY_TYPES.ARBITRATOR_OUTCOME_ANALYSIS: {
        if (!arbitratorName) {
          return { data: null, message: "No arbitrator name specified in the query." };
        }
        
        // Get all distinct arbitrator names from the database to do advanced name matching
        const allArbitratorNames = await db
          .select({ name: arbitrationCases.arbitratorName })
          .from(arbitrationCases)
          .where(
            // First do a basic filter to narrow down the results
            sql`arbitrator_name IS NOT NULL AND LOWER(arbitrator_name) LIKE LOWER(${'%' + (arbitratorName ? arbitratorName.split(' ').pop() || '' : '') + '%'})`
          )
          .groupBy(arbitrationCases.arbitratorName)
          .execute();
          
        // Find all matching names using our advanced name matching logic
        const matchingNames = allArbitratorNames
          .filter(item => item.name && doNamesMatch(arbitratorName, item.name))
          .map(item => item.name);
          
        if (matchingNames.length === 0) {
          return {
            data: { outcomes: [] },
            message: `No cases found for arbitrator ${arbitratorName}.`,
          };
        }
        
        // If we found multiple names, aggregate outcomes across all matching names
        const allOutcomes = new Map<string, number>();
        let totalCases = 0;
        
        // Process each matching name
        for (const name of matchingNames) {
          // Get outcomes grouped by disposition for this name
          const results = await db
            .select({
              disposition: arbitrationCases.disposition,
              count: sql`COUNT(*)`,
            })
            .from(arbitrationCases)
            .where(sql`arbitrator_name = ${name}`)
            .groupBy(arbitrationCases.disposition)
            .execute();
            
          // Aggregate results
          for (const result of results) {
            const disposition = result.disposition || "Unknown";
            const count = Number(result.count || 0);
            totalCases += count;
            
            // Add to our aggregate map
            const currentCount = allOutcomes.get(disposition) || 0;
            allOutcomes.set(disposition, currentCount + count);
          }
        }
        
        // If no results found
        if (allOutcomes.size === 0) {
          return {
            data: { outcomes: [] },
            message: `No outcome data found for arbitrator ${arbitratorName}.`,
          };
        }
        
        // Format the results
        const outcomes = Array.from(allOutcomes.entries()).map(([disposition, count]) => ({
          disposition,
          count,
        }));
        
        // Create a summary message
        let message = '';
        
        if (matchingNames.length > 1) {
          message = `Found ${matchingNames.length} arbitrators matching "${arbitratorName}" with a total of ${totalCases} cases:\n`;
          matchingNames.forEach(name => {
            message += `- ${name}\n`;
          });
          message += `\nCombined outcomes across all matching arbitrators:\n`;
        } else {
          message = `${matchingNames[0]} has handled ${totalCases} cases with the following outcomes:\n`;
        }
        
        // Sort outcomes by count (highest first)
        outcomes.sort((a, b) => b.count - a.count);
        
        outcomes.forEach((o) => {
          const percentage = ((o.count / totalCases) * 100).toFixed(1);
          message += `- ${o.disposition}: ${o.count} cases (${percentage}%)\n`;
        });
        
        return {
          data: { 
            outcomes,
            matchingNames,
            totalCases
          },
          message,
        };
      }
      
      case QUERY_TYPES.ARBITRATOR_AVERAGE_AWARD: {
        if (!arbitratorName) {
          return { data: null, message: "No arbitrator name specified in the query." };
        }
        
        // Get all distinct arbitrator names from the database to do advanced name matching
        const allArbitratorNames = await db
          .select({ name: arbitrationCases.arbitratorName })
          .from(arbitrationCases)
          .where(
            // First do a basic filter to narrow down the results
            sql`arbitrator_name IS NOT NULL AND LOWER(arbitrator_name) LIKE LOWER(${'%' + (arbitratorName ? arbitratorName.split(' ').pop() || '' : '') + '%'})`
          )
          .groupBy(arbitrationCases.arbitratorName)
          .execute();
          
        // Find all matching names using our advanced name matching logic
        const matchingNames = allArbitratorNames
          .filter(item => item.name && doNamesMatch(arbitratorName, item.name))
          .map(item => item.name);
          
        if (matchingNames.length === 0) {
          return {
            data: null,
            message: `No cases found for arbitrator ${arbitratorName}.`,
          };
        }
        
        // If we found matching names, calculate aggregate award statistics
        let totalCases = 0;
        let totalWithAward = 0;
        let totalAwardAmount = 0;
        
        // Process each matching name
        for (const name of matchingNames) {
          // First query to get total case count for the arbitrator
          const countQuery = db
            .select({
              countCases: sql`COUNT(*)`,
            })
            .from(arbitrationCases)
            .where(sql`arbitrator_name = ${name}`);
            
          // Add disposition filter if provided (for total case count)
          if (disposition) {
            countQuery.where(sql`LOWER(disposition) LIKE LOWER(${'%' + disposition + '%'})`) as any;
          }
          
          const countResult = await countQuery.execute();
          const totalCasesForArbitrator = Number(countResult[0]?.countCases || 0);
          
          // Second query to get award statistics ONLY for cases with "award" in disposition
          const awardQuery = db
            .select({
              avgAward: sql`AVG(NULLIF(award_amount, '')::numeric)`,
              countWithAward: sql`COUNT(NULLIF(award_amount, ''))`,
              sumAward: sql`SUM(NULLIF(award_amount, '')::numeric)`,
            })
            .from(arbitrationCases)
            .where(sql`arbitrator_name = ${name} AND LOWER(disposition) LIKE '%award%'`);
            
          // Add additional disposition filter if provided
          if (disposition && !disposition.toLowerCase().includes('award')) {
            awardQuery.where(sql`LOWER(disposition) LIKE LOWER(${'%' + disposition + '%'})`) as any;
          }
          
          const awardResult = await awardQuery.execute();
          
          // Add the total case count from the first query
          totalCases += totalCasesForArbitrator;
          
          // Add the award statistics from cases where disposition is "award"
          if (awardResult.length && awardResult[0].countWithAward > 0) {
            totalWithAward += Number(awardResult[0].countWithAward || 0);
            totalAwardAmount += Number(awardResult[0].sumAward || 0);
          }
        }
        
        if (totalCases === 0) {
          return {
            data: null,
            message: `No cases found for arbitrator ${arbitratorName}${
              disposition ? ` with disposition containing "${disposition}"` : ""
            }.`,
          };
        }
        
        if (totalWithAward === 0) {
          return {
            data: { 
              avgAward: 0, 
              countCases: totalCases, 
              countWithAward: 0,
              matchingNames
            },
            message: `${matchingNames.length > 1 ? 'Matching arbitrators' : matchingNames[0]} ${matchingNames.length > 1 ? 'have' : 'has'} handled ${totalCases} cases${
              disposition ? ` with disposition containing "${disposition}"` : ""
            }, but none have award amount data available.`,
          };
        }
        
        // Calculate the average award amount
        const avgAward = totalAwardAmount / totalWithAward;
        
        // Format the average award with $ and commas
        const formattedAvgAward = new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
        }).format(avgAward || 0);
        
        // Create appropriate message based on whether we have multiple matching names
        let message = '';
        if (matchingNames.length > 1) {
          message = `Found ${matchingNames.length} arbitrators matching "${arbitratorName}":\n`;
          matchingNames.forEach(name => {
            message += `- ${name}\n`;
          });
          message += `\nCombined, they have handled ${totalCases} cases${
            disposition ? ` with disposition containing "${disposition}"` : ""
          }. The average award amount is ${formattedAvgAward} (based on ${totalWithAward} cases with award data).`;
        } else {
          message = `${matchingNames[0]} has handled ${totalCases} cases${
            disposition ? ` with disposition containing "${disposition}"` : ""
          }. The average award amount is ${formattedAvgAward} (based on ${totalWithAward} cases with award data).`;
        }
        
        return {
          data: {
            avgAward: avgAward || 0,
            countCases: totalCases,
            countWithAward: totalWithAward,
            matchingNames
          },
          message,
        };
      }
      
      case QUERY_TYPES.ARBITRATOR_CASE_LISTING: {
        if (!arbitratorName) {
          return { data: null, message: "No arbitrator name specified in the query." };
        }
        
        // Get all distinct arbitrator names from the database to do advanced name matching
        const allArbitratorNames = await db
          .select({ name: arbitrationCases.arbitratorName })
          .from(arbitrationCases)
          .where(
            // First do a basic filter to narrow down the results
            sql`arbitrator_name IS NOT NULL AND LOWER(arbitrator_name) LIKE LOWER(${'%' + (arbitratorName ? arbitratorName.split(' ').pop() || '' : '') + '%'})`
          )
          .groupBy(arbitrationCases.arbitratorName)
          .execute();
          
        // Find all matching names using our advanced name matching logic
        const matchingNames = allArbitratorNames
          .filter(item => item.name && doNamesMatch(arbitratorName, item.name))
          .map(item => item.name);
          
        if (matchingNames.length === 0) {
          return {
            data: { cases: [] },
            message: `No cases found for arbitrator ${arbitratorName}.`,
          };
        }
        
        // Collect all cases for all matching arbitrator names
        let allCases = [];
        
        for (const name of matchingNames) {
          // Get the list of cases for this specific arbitrator name
          const cases = await db
            .select({
              caseId: arbitrationCases.caseId,
              arbitratorName: arbitrationCases.arbitratorName,
              respondentName: arbitrationCases.respondentName,
              disposition: arbitrationCases.disposition,
              caseType: arbitrationCases.caseType,
              awardAmount: arbitrationCases.awardAmount,
            })
            .from(arbitrationCases)
            .where(sql`arbitrator_name = ${name}`)
            .execute();
            
          allCases = [...allCases, ...cases];
        }
        
        // Enforce a limit to prevent extremely large results
        // Sort by case ID (descending) as a fallback for not having filing date
        allCases.sort((a, b) => {
          if (!a.caseId && !b.caseId) return 0;
          if (!a.caseId) return 1;
          if (!b.caseId) return -1;
          return b.caseId.localeCompare(a.caseId);
        });
        
        const limitedCases = allCases.slice(0, 50);
        
        if (limitedCases.length === 0) {
          return {
            data: { cases: [] },
            message: `No cases found for arbitrator ${arbitratorName}.`,
          };
        }
        
        // Prepare response message based on whether we found multiple matching names
        let message = '';
        
        if (matchingNames.length > 1) {
          message = `Found ${matchingNames.length} arbitrators matching "${arbitratorName}":\n`;
          matchingNames.forEach(name => {
            message += `- ${name}\n`;
          });
          message += `\nCombined cases (showing ${
            limitedCases.length >= 50 ? "first 50" : "all " + limitedCases.length
          } of ${allCases.length} total):\n\n`;
        } else {
          message = `Cases handled by ${matchingNames[0]} (showing ${
            limitedCases.length >= 50 ? "first 50" : "all " + limitedCases.length
          }):\n\n`;
        }
        
        limitedCases.forEach((c, i) => {
          message += `${i + 1}. Case ID: ${c.caseId}\n`;
          message += `   Case Type: ${c.caseType || "Unknown"}\n`;
          message += `   Arbitrator: ${c.arbitratorName}\n`;
          message += `   Respondent: ${c.respondentName || "Unknown"}\n`;
          message += `   Disposition: ${c.disposition || "Unknown"}\n`;
          
          // Show award amount for awarded cases
          if (c.disposition === "Awarded" && c.awardAmount) {
            message += `   Award Amount: $${c.awardAmount}\n`;
          }
          
          message += "\n";
        });
        
        if (allCases.length > 50) {
          message += "Note: Only showing the first 50 cases. The arbitrator(s) have handled more cases.";
        }
        
        return {
          data: { 
            cases: limitedCases,
            matchingNames,
            totalCaseCount: allCases.length
          },
          message,
        };
      }
      
      case QUERY_TYPES.RESPONDENT_OUTCOME_ANALYSIS: {
        if (!respondentName) {
          return { data: null, message: "No respondent name specified in the query." };
        }
        
        // First get all matching respondent names to handle variations
        const similarNameResults = await db
          .select({ name: arbitrationCases.respondentName })
          .from(arbitrationCases)
          .where(sql`respondent_name IS NOT NULL AND LOWER(respondent_name) LIKE LOWER(${'%' + (respondentName ? respondentName : '') + '%'})`)
          .groupBy(arbitrationCases.respondentName)
          .execute();
          
        // Standardize the respondent name for consistent matching
        const standardizedRespondentName = standardizeName(respondentName);
          
        // Use broader pattern matching for companies with similar names
        // e.g. "Coinbase" should match "Coinbase Inc", "Coinbase Global", etc.
        const matchingNames = similarNameResults
          .filter(item => item.name)
          .map(item => item.name);
          
        if (matchingNames.length === 0) {
          return {
            data: { outcomes: [] },
            message: `No cases found for respondent ${respondentName}${
              arbitratorName ? ` with arbitrator ${arbitratorName}` : ""
            }.`,
          };
        }
        
        // Get the outcomes with all matching respondent names
        const allOutcomes = new Map<string, number>();
        let totalCases = 0;
        const nameStats = new Map<string, number>();
        
        // Process each matching respondent name
        for (const name of matchingNames) {
          // Build query for this specific respondent name
          let query = db
            .select({
              disposition: arbitrationCases.disposition,
              count: sql`COUNT(*)`,
            })
            .from(arbitrationCases)
            .where(sql`respondent_name = ${name}`);
          
          // Add arbitrator filter if provided
          if (arbitratorName) {
            const arbitratorValue = arbitratorName;
            query = query.where(sql`LOWER(arbitrator_name) LIKE LOWER(${'%' + arbitratorValue + '%'})`) as any;
          }
          
          const results = await query.groupBy(arbitrationCases.disposition).execute();
          
          // Skip if no results for this name (e.g., filtered out by arbitrator)
          if (results.length === 0) continue;
          
          // Track the number of cases by this respondent name
          const nameTotal = results.reduce((sum, r) => sum + Number(r.count || 0), 0);
          nameStats.set(name, nameTotal);
          
          // Aggregate results
          for (const result of results) {
            const disposition = result.disposition || "Unknown";
            const count = Number(result.count || 0);
            totalCases += count;
            
            // Add to our aggregate map
            const currentCount = allOutcomes.get(disposition) || 0;
            allOutcomes.set(disposition, currentCount + count);
          }
        }
        
        if (allOutcomes.size === 0) {
          return {
            data: { outcomes: [] },
            message: `No cases found for respondent ${respondentName}${
              arbitratorName ? ` with arbitrator ${arbitratorName}` : ""
            }.`,
          };
        }
        
        // Format the results
        const outcomes = Array.from(allOutcomes.entries()).map(([disposition, count]) => ({
          disposition,
          count,
        }));
        
        // Create a summary message
        let message = '';
        
        // If we have multiple matching names, list them
        if (matchingNames.length > 1) {
          message = `Found ${matchingNames.length} respondents matching "${respondentName}" with a total of ${totalCases} cases:\n`;
          
          // Sort respondent names by case count (most frequent first)
          const sortedNames = Array.from(nameStats.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([name, count]) => `- ${name}: ${count} cases`);
          
          // Only show the top 5 variations to keep the message concise
          const topNames = sortedNames.slice(0, 5);
          if (sortedNames.length > 5) {
            topNames.push(`- ...and ${sortedNames.length - 5} more variations`);
          }
          
          message += topNames.join('\n') + '\n\nCombined outcomes:\n';
        } else {
          message = `${respondentName} has been involved in ${totalCases} cases${
            arbitratorName ? ` with arbitrator ${arbitratorName}` : ""
          }. The outcomes are:\n`;
        }
        
        // Sort outcomes by count (highest first)
        outcomes.sort((a, b) => b.count - a.count);
        
        outcomes.forEach((o) => {
          const percentage = ((o.count / totalCases) * 100).toFixed(1);
          message += `- ${o.disposition}: ${o.count} cases (${percentage}%)\n`;
        });
        
        return {
          data: { 
            outcomes,
            matchingNames: Array.from(nameStats.entries())
              .sort((a, b) => b[1] - a[1])
              .map(([name, count]) => ({ name, count }))
          },
          message,
        };
      }
      
      case QUERY_TYPES.COMBINED_OUTCOME_ANALYSIS: {
        if (!arbitratorName || !respondentName) {
          return { 
            data: null, 
            message: "Could not identify both arbitrator and respondent names in the query." 
          };
        }
        
        // Get all distinct arbitrator names from the database that match our query
        const allArbitratorNames = await db
          .select({ name: arbitrationCases.arbitratorName })
          .from(arbitrationCases)
          .where(
            sql`arbitrator_name IS NOT NULL AND LOWER(arbitrator_name) LIKE LOWER(${'%' + (arbitratorName ? arbitratorName.split(' ').pop() || '' : '') + '%'})`
          )
          .groupBy(arbitrationCases.arbitratorName)
          .execute();
          
        // Find all matching arbitrator names using our advanced name matching logic
        const matchingArbitratorNames = allArbitratorNames
          .filter(item => item.name && doNamesMatch(arbitratorName, item.name))
          .map(item => item.name);
          
        // Get all distinct respondent names from the database that match our query
        const allRespondentNames = await db
          .select({ name: arbitrationCases.respondentName })
          .from(arbitrationCases)
          .where(
            sql`respondent_name IS NOT NULL AND LOWER(respondent_name) LIKE LOWER(${'%' + (respondentName ? respondentName : '') + '%'})`
          )
          .groupBy(arbitrationCases.respondentName)
          .execute();
          
        // Get matching respondent names
        const matchingRespondentNames = allRespondentNames
          .filter(item => item.name)
          .map(item => item.name);
          
        if (matchingArbitratorNames.length === 0 || matchingRespondentNames.length === 0) {
          return {
            data: { outcomes: [] },
            message: `No cases found with arbitrator ${arbitratorName} and respondent ${respondentName}.`,
          };
        }
        
        // Aggregate outcomes for the intersection of these arbitrators and respondents
        const allOutcomes = new Map<string, number>();
        let totalCases = 0;
        
        // Build a query that combines both arbitrator and respondent constraints
        for (const arbName of matchingArbitratorNames) {
          for (const respName of matchingRespondentNames) {
            const results = await db
              .select({
                disposition: arbitrationCases.disposition,
                count: sql`COUNT(*)`,
              })
              .from(arbitrationCases)
              .where(sql`arbitrator_name = ${arbName} AND respondent_name = ${respName}`)
              .groupBy(arbitrationCases.disposition)
              .execute();
              
            // Aggregate results
            for (const result of results) {
              const disposition = result.disposition || "Unknown";
              const count = Number(result.count || 0);
              totalCases += count;
              
              // Add to our aggregate map
              const currentCount = allOutcomes.get(disposition) || 0;
              allOutcomes.set(disposition, currentCount + count);
            }
          }
        }
        
        if (allOutcomes.size === 0) {
          return {
            data: { outcomes: [] },
            message: `No cases found where arbitrator ${arbitratorName} ruled on cases involving respondent ${respondentName}.`,
          };
        }
        
        // Format the results
        const outcomes = Array.from(allOutcomes.entries()).map(([disposition, count]) => ({
          disposition,
          count,
        }));
        
        // Create a summary message
        let message = `Found ${totalCases} cases where arbitrator ${arbitratorName} ruled on cases involving respondent ${respondentName}. The outcomes are:\n`;
        
        // Sort outcomes by count (highest first)
        outcomes.sort((a, b) => b.count - a.count);
        
        outcomes.forEach((o) => {
          const percentage = ((o.count / totalCases) * 100).toFixed(1);
          message += `- ${o.disposition}: ${o.count} cases (${percentage}%)\n`;
        });
        
        return {
          data: { 
            outcomes,
            totalCases,
            matchingArbitratorNames,
            matchingRespondentNames
          },
          message,
        };
      }
        
      case QUERY_TYPES.ARBITRATOR_RANKING: {
        // This query type doesn't require a specific arbitrator name
        // It's used for queries like "Which arbitrators tend to award higher amounts?"
        try {
          // Get top arbitrators by average award amount
          const topArbitrators = await db
            .select({
              arbitratorName: arbitrationCases.arbitratorName,
              avgAward: sql`AVG(
                CASE 
                  WHEN award_amount ~ '^\\$?[0-9,.]+$' 
                  THEN CAST(REPLACE(REPLACE(REPLACE(award_amount, '$', ''), ',', ''), ' ', '') AS NUMERIC) 
                  ELSE 0 
                END
              )`.as('avg_award'),
              caseCount: sql`COUNT(*)`.as('case_count'),
              awardCount: sql`COUNT(CASE WHEN award_amount IS NOT NULL AND award_amount != '' THEN 1 END)`.as('award_count')
            })
            .from(arbitrationCases)
            .where(
              sql`arbitrator_name IS NOT NULL 
                  AND award_amount IS NOT NULL 
                  AND award_amount != '' 
                  AND award_amount ~ '^\\$?[0-9,.]+$'`
            )
            // If case type is specified (e.g., "consumer"), filter by it
            .where(caseType ? sql`LOWER(case_type) LIKE LOWER(${'%' + caseType + '%'})` : sql`1=1`)
            .groupBy(arbitrationCases.arbitratorName)
            // Only include arbitrators with a minimum number of cases with awards
            .having(sql`COUNT(CASE WHEN award_amount IS NOT NULL AND award_amount != '' THEN 1 END) >= 5`)
            .orderBy(sql`avg_award DESC`)
            .limit(10)
            .execute();
          
          if (topArbitrators.length === 0) {
            return {
              data: null,
              message: "I couldn't find any arbitrators with sufficient award data to analyze.",
            };
          }
          
          // Format the results into a readable message
          const formattedResults = topArbitrators.map(row => ({
            arbitratorName: row.arbitratorName,
            averageAward: new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(row.avgAward),
            caseCount: row.caseCount,
            awardCount: row.awardCount
          }));
          
          // Create a user-friendly message
          let message = "Here are the arbitrators with the highest average award amounts";
          if (caseType) {
            message += ` in ${caseType} cases`;
          }
          message += ":\n\n";
          
          formattedResults.forEach((arb, index) => {
            message += `${index + 1}. ${arb.arbitratorName}: ${arb.averageAward} average award (${arb.awardCount} awards out of ${arb.caseCount} cases)\n`;
          });
          
          return {
            data: formattedResults,
            message: message,
          };
        } catch (error) {
          console.error("Error in arbitrator ranking query:", error);
          return {
            data: null,
            message: "An error occurred while analyzing arbitrator award amounts. Please try again.",
          };
        }
      }
        
      case QUERY_TYPES.TIME_BASED_ANALYSIS: {
        if (!year && !timeframe) {
          return { 
            data: null, 
            message: "No timeframe specified in the query. Please include a specific year or time period." 
          };
        }
        
        // Build a query to count cases with the specified disposition in the given timeframe
        let yearCondition = '';
        let timeframeDisplay = '';
        
        if (year) {
          // Extract year from filing_date for comparison
          yearCondition = `EXTRACT(YEAR FROM filing_date) = ${year}`;
          timeframeDisplay = `in ${year}`;
          console.log(`Year condition: ${yearCondition}`);
        } else if (timeframe === 'last year') {
          const lastYear = new Date().getFullYear() - 1;
          yearCondition = `EXTRACT(YEAR FROM filing_date) = ${lastYear}`;
          timeframeDisplay = `in ${lastYear} (last year)`;
        } else if (timeframe === 'this year') {
          const thisYear = new Date().getFullYear();
          yearCondition = `EXTRACT(YEAR FROM filing_date) = ${thisYear}`;
          timeframeDisplay = `in ${thisYear} (this year)`;
        } else if (timeframe === 'past 5 years') {
          const currentYear = new Date().getFullYear();
          const fiveYearsAgo = currentYear - 5;
          yearCondition = `EXTRACT(YEAR FROM filing_date) BETWEEN ${fiveYearsAgo} AND ${currentYear}`;
          timeframeDisplay = `in the past 5 years (${fiveYearsAgo}-${currentYear})`;
        } else {
          // If we have a timeframe but couldn't parse it into a SQL condition
          return { 
            data: null, 
            message: `I couldn't understand the timeframe "${timeframe}". Please specify a year like "2020" or a period like "last year".`
          };
        }
        
        // Determine the disposition filter based on the disposition parameter
        let dispositionCondition = '';
        let dispositionDisplay = '';
        
        if (disposition) {
          if (disposition === 'award') {
            dispositionCondition = `LOWER(disposition) LIKE '%award%'`;
            dispositionDisplay = 'awarded';
          } else if (disposition === 'dismiss') {
            dispositionCondition = `LOWER(disposition) LIKE '%dismiss%'`;
            dispositionDisplay = 'dismissed';
          } else if (disposition === 'settle') {
            dispositionCondition = `LOWER(disposition) LIKE '%settle%'`;
            dispositionDisplay = 'settled';
          } else if (disposition === 'withdraw') {
            dispositionCondition = `LOWER(disposition) LIKE '%withdraw%'`;
            dispositionDisplay = 'withdrawn';
          } else {
            dispositionCondition = `LOWER(disposition) LIKE '%${disposition}%'`;
            dispositionDisplay = `with disposition containing "${disposition}"`;
          }
        } else {
          // If no specific disposition was requested, we'll count all cases
          dispositionDisplay = 'total';
        }
        
        // Build the query
        console.log(`Executing time-based query with condition: ${yearCondition} and disposition: ${dispositionCondition || 'any'}`);
        
        // Use a simpler query approach that's guaranteed to work with PostgreSQL
        console.log(`Raw SQL Query: SELECT COUNT(*) FROM arbitration_cases WHERE ${yearCondition} ${disposition ? `AND ${dispositionCondition}` : ''} AND duplicate_of IS NULL`);
        
        // First verify if we have any matching records
        const verifyQuery = await db.execute(sql`
          SELECT 1 FROM arbitration_cases 
          WHERE ${sql.raw(yearCondition)}
          ${disposition ? sql`AND ${sql.raw(dispositionCondition)}` : sql``}
          AND duplicate_of IS NULL
          LIMIT 1
        `);
        
        console.log('Verify query result:', verifyQuery);
        
        // If no records match at all
        if (!verifyQuery || !verifyQuery.length) {
          return {
            data: { count: 0 },
            message: `No data found for cases ${dispositionDisplay} ${timeframeDisplay}.`
          };
        }
        
        // Now do the actual count query
        const countQuery = await db.execute(sql`
          SELECT COUNT(*) as count
          FROM arbitration_cases 
          WHERE ${sql.raw(yearCondition)}
          ${disposition ? sql`AND ${sql.raw(dispositionCondition)}` : sql``}
          AND duplicate_of IS NULL
        `);
        
        console.log('Count query result:', countQuery);
        
        // Get the count value from the result
        let count = 0;
        if (countQuery && countQuery.length > 0) {
          // Try multiple properties that might contain the count
          const row = countQuery[0];
          if (row.count !== undefined) count = Number(row.count);
          else if (row.case_count !== undefined) count = Number(row.case_count);
          else if (row['count(*)'] !== undefined) count = Number(row['count(*)']);
          else {
            // If we can't find a specific property, look for any property that might be the count
            const keys = Object.keys(row);
            if (keys.length > 0) {
              count = Number(row[keys[0]]);
            }
          }
        }
        
        console.log('Count result:', count);
        
        return {
          data: { 
            count,
            year: year,
            timeframe: timeframe,
            disposition: disposition 
          },
          message: `${count} cases were ${dispositionDisplay} ${timeframeDisplay}.`
        };
      }
        
      case QUERY_TYPES.COMPLEX_ANALYSIS: {
        // This is a placeholder for complex queries that will be handled by OpenAI
        // The actual processing happens in processNaturalLanguageQuery
        return {
          data: null,
          message: "This query requires advanced analysis. Processing with AI...",
        };
      }
      
      default:
        return {
          data: null,
          message: "I couldn't understand the type of question. Please try rephrasing your query.",
        };
    }
  } catch (error) {
    console.error("Error executing query:", error);
    return {
      data: null,
      message: "An error occurred while processing your query. Please try again.",
    };
  }
}

/**
 * Process a natural language query about arbitration data
 * @param query The natural language query from the user
 */
export async function processNaturalLanguageQuery(query: string): Promise<{
  answer: string;
  data: any;
  queryType: string;
}> {
  try {
    console.log("Processing natural language query:", query);
    
    // First, try our structured pattern matching
    const patternAnalysis = await analyzeQuery(query);
    
    // If we couldn't categorize the query or its type is unknown, try AI-powered analysis
    if (patternAnalysis.type === QUERY_TYPES.UNKNOWN) {
      console.log("Standard pattern analysis failed, trying AI analysis");
      
      try {
        // Use OpenAI to analyze the query
        const aiAnalysis = await analyzeQueryWithAI(query);
        console.log("AI query analysis result:", aiAnalysis);
        
        // If AI analysis is confident (threshold of 0.7), use its results
        if (aiAnalysis.confidence >= 0.7) {
          // Map the AI intent to our query types
          let queryType = QUERY_TYPES.UNKNOWN;
          
          // Convert AI intent to our query type format if possible
          switch (aiAnalysis.intent.toUpperCase()) {
            case "ARBITRATOR_CASE_COUNT":
              queryType = QUERY_TYPES.ARBITRATOR_CASE_COUNT;
              break;
            case "ARBITRATOR_OUTCOME_ANALYSIS":
              queryType = QUERY_TYPES.ARBITRATOR_OUTCOME_ANALYSIS;
              break;
            case "ARBITRATOR_AVERAGE_AWARD":
              queryType = QUERY_TYPES.ARBITRATOR_AVERAGE_AWARD;
              break;
            case "ARBITRATOR_CASE_LISTING":
              queryType = QUERY_TYPES.ARBITRATOR_CASE_LISTING;
              break;
            case "RESPONDENT_CASE_COUNT":
              queryType = QUERY_TYPES.RESPONDENT_CASE_COUNT;
              break;
            case "RESPONDENT_OUTCOME_ANALYSIS":
              queryType = QUERY_TYPES.RESPONDENT_OUTCOME_ANALYSIS;
              break;
            case "COMBINED_OUTCOME_ANALYSIS":
              queryType = QUERY_TYPES.COMBINED_OUTCOME_ANALYSIS;
              break;
            case "ARBITRATOR_RANKING":
              queryType = QUERY_TYPES.ARBITRATOR_RANKING;
              break;
            case "TIME_BASED_ANALYSIS":
              queryType = QUERY_TYPES.TIME_BASED_ANALYSIS;
              break;
            case "COMPLEX_ANALYSIS":
              queryType = QUERY_TYPES.COMPLEX_ANALYSIS;
              break;
            default:
              queryType = QUERY_TYPES.COMPLEX_ANALYSIS;
          }
          
          // If we identified a standard query type, use our existing infrastructure
          if (queryType !== QUERY_TYPES.COMPLEX_ANALYSIS) {
            const parameters: Record<string, string | null> = {
              arbitratorName: aiAnalysis.arbitratorName || null,
              respondentName: aiAnalysis.respondentName || null,
              disposition: aiAnalysis.disposition || null,
              caseType: aiAnalysis.caseType || null,
              year: null, // Will be extracted from timeframe if present
              timeframe: aiAnalysis.timeframe || null,
            };
            
            // If we have a timeframe that looks like a year, also set the year parameter
            if (aiAnalysis.timeframe && /^\d{4}$/.test(aiAnalysis.timeframe)) {
              parameters.year = aiAnalysis.timeframe;
            }
            
            console.log("Using AI analysis with standard query type:", queryType);
            const result = await executeQueryByType(queryType, parameters);
            
            return {
              answer: result.message,
              data: result.data,
              queryType,
            };
          } else {
            // This is a complex query that requires custom SQL or processing
            console.log("Using AI for complex query analysis");
            
            try {
              // Generate SQL for the query
              const sqlGen = await generateSQLForQuery(query);
              console.log("Generated SQL:", sqlGen.sql);
              
              // If SQL was successfully generated, execute it
              if (sqlGen.sql) {
                const queryResults = await db.execute(sql.raw(sqlGen.sql));
                
                // Use AI to generate a natural language response based on the results
                const aiResponse = await generateComplexQueryResponse(query, queryResults);
                
                return {
                  answer: aiResponse,
                  data: queryResults,
                  queryType: QUERY_TYPES.COMPLEX_ANALYSIS,
                };
              }
              
              return {
                answer: "I couldn't generate a query for your question. Please try a more specific question.",
                data: null,
                queryType: QUERY_TYPES.COMPLEX_ANALYSIS,
              };
            } catch (sqlError: any) {
              console.error("Error executing AI-generated SQL:", sqlError);
              
              // Fallback to a generic AI response when SQL execution fails
              return {
                answer: "I understood your question but couldn't retrieve the data. Please try a different question.",
                data: null,
                queryType: QUERY_TYPES.COMPLEX_ANALYSIS,
              };
            }
          }
        }
      } catch (aiError: any) {
        console.error("AI analysis failed, falling back to standard patterns:", aiError.message);
        
        // If it's a rate limit error, provide a more specific message
        if (aiError.status === 429 || (aiError.error && aiError.error.type === 'insufficient_quota')) {
          return {
            answer: "I understood your complex question, but our AI service is currently unavailable. Please try a standard query format or try again later.",
            data: null,
            queryType: QUERY_TYPES.UNKNOWN
          };
        }
      }
    }
    
    // If we get here, use the original pattern matching results
    console.log("Using standard pattern analysis");
    const result = await executeQueryByType(patternAnalysis.type, patternAnalysis.parameters);
    
    return {
      answer: result.message,
      data: result.data,
      queryType: patternAnalysis.type,
    };
  } catch (error: any) {
    console.error("Error processing natural language query:", error);
    return {
      answer: "Sorry, I encountered an error while processing your question. Please try again.",
      data: null,
      queryType: QUERY_TYPES.UNKNOWN,
    };
  }
}