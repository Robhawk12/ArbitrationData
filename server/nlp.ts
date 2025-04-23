import { db } from "./db";
import { sql, desc } from "drizzle-orm";
import { arbitrationCases } from "../shared/schema";

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
    
    // First, check if this is a combined query (both arbitrator and respondent)
    const combinedQuery = extractCombinedQuery(query);
    if (combinedQuery) {
      type = QUERY_TYPES.COMBINED_OUTCOME_ANALYSIS;
      arbitratorName = combinedQuery.arbitratorName;
      respondentName = combinedQuery.respondentName;
      
      // We've identified this as a combined query, so return early
      console.log("Analyzed as combined query with both arbitrator and respondent");
      console.log("Parameters:", { arbitratorName, respondentName, disposition, caseType });
      
      return {
        type,
        parameters: {
          arbitratorName,
          respondentName,
          disposition,
          caseType,
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
    console.log("Parameters:", { arbitratorName, respondentName, disposition, caseType });
    
    return {
      type,
      parameters: {
        arbitratorName,
        respondentName,
        disposition,
        caseType,
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
    const { arbitratorName, respondentName, disposition, caseType } = parameters;
    
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
            data: { outcomes: [], cases: [] },
            message: `No cases found for respondent ${respondentName}${
              arbitratorName ? ` with arbitrator ${arbitratorName}` : ""
            }.`,
          };
        }
        
        // Get the outcomes with all matching respondent names
        const allOutcomes = new Map<string, number>();
        let totalCases = 0;
        const nameStats = new Map<string, number>();
        
        // First pass: get the outcome stats and total counts
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
            data: { outcomes: [], cases: [] },
            message: `No cases found for respondent ${respondentName}${
              arbitratorName ? ` with arbitrator ${arbitratorName}` : ""
            }.`,
          };
        }
        
        // Second pass: get the individual case details
        // We'll use a simpler approach with a raw SQL query to avoid Drizzle issues
        let query = `
          SELECT 
            id, case_id, forum, arbitrator_name, claimant_name, respondent_name, 
            filing_date, disposition, claim_amount, award_amount, case_type, status
          FROM arbitration_cases
          WHERE respondent_name IN (${matchingNames.map(name => `'${name.replace(/'/g, "''")}'`).join(',')})
        `;
        
        // Add arbitrator filter if provided
        if (arbitratorName) {
          query += ` AND LOWER(arbitrator_name) LIKE LOWER('%${arbitratorName.replace(/'/g, "''")}%')`;
        }
        
        // Order by filing date descending and limit to prevent too much data
        query += ` ORDER BY filing_date DESC LIMIT 50`;
        
        const result = await db.execute(sql.raw(query));
        // Convert the PostgreSQL result to a proper array we can work with
        const allCases: Record<string, any>[] = Array.isArray(result) ? result : (result as any).rows || [];
        
        // Format the outcomes results
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
          message += topNames.join('\n');
          
          if (sortedNames.length > 5) {
            message += `\n...and ${sortedNames.length - 5} more variations`;
          }
          
          message += "\n\nCombined outcomes:\n";
        } else {
          message = `Found ${totalCases} cases for respondent ${matchingNames[0]}${
            arbitratorName ? ` with arbitrator ${arbitratorName}` : ""
          }:\n\n`;
          message += "Outcomes summary:\n";
        }
        
        // Sort outcomes by count (highest first)
        outcomes.sort((a, b) => b.count - a.count);
        
        // Add outcome summary
        outcomes.forEach((o) => {
          const percentage = ((o.count / totalCases) * 100).toFixed(1);
          message += `- ${o.disposition}: ${o.count} cases (${percentage}%)\n`;
        });
        
        // Add detailed case listing
        message += "\nCase details (showing " + 
                   (allCases.length >= 50 ? "first 50" : "all " + allCases.length) + 
                   " of " + totalCases + " total cases):\n\n";
        
        // Show the case details
        allCases.forEach((c, i) => {
          // With raw SQL, we need to use snake_case column names
          message += `${i + 1}. Case ID: ${c.case_id}\n`;
          if (c.filing_date) message += `   Filing Date: ${c.filing_date}\n`;
          message += `   Forum: ${c.forum || "Unknown"}\n`;
          message += `   Arbitrator: ${c.arbitrator_name || "Unknown"}\n`;
          message += `   Respondent: ${c.respondent_name || "Unknown"}\n`;
          if (c.claimant_name) message += `   Claimant: ${c.claimant_name}\n`;
          message += `   Disposition: ${c.disposition || "Unknown"}\n`;
          
          // Show monetary amounts for cases that have them
          if (c.claim_amount) message += `   Claim Amount: $${c.claim_amount}\n`;
          if (c.award_amount) message += `   Award Amount: $${c.award_amount}\n`;
          
          if (c.case_type) message += `   Case Type: ${c.case_type}\n`;
          message += "\n";
        });
        
        if (totalCases > 50) {
          message += "Note: Only showing the first 50 cases. There are " + totalCases + " total cases matching this query.";
        }
        
        return {
          data: { 
            outcomes,
            cases: allCases,
            matchingNames: Array.from(nameStats.entries())
              .sort((a, b) => b[1] - a[1])
              .map(([name, count]) => ({ name, count })),
            totalCaseCount: totalCases
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
    // First, analyze the query to determine its type and extract parameters
    const analysis = await analyzeQuery(query);
    
    // Then execute the appropriate query based on the analysis
    const result = await executeQueryByType(analysis.type, analysis.parameters);
    
    return {
      answer: result.message,
      data: result.data,
      queryType: analysis.type,
    };
  } catch (error) {
    console.error("Error processing natural language query:", error);
    return {
      answer: "Sorry, I encountered an error while processing your question. Please try again.",
      data: null,
      queryType: QUERY_TYPES.UNKNOWN,
    };
  }
}