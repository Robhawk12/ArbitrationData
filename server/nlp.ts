import { db } from "./db";
import { sql } from "drizzle-orm";
import { arbitrationCases } from "../shared/schema";

// Define the types of questions the system can handle
const QUERY_TYPES = {
  ARBITRATOR_CASE_COUNT: "arbitrator_case_count",
  ARBITRATOR_OUTCOME_ANALYSIS: "arbitrator_outcome_analysis",
  ARBITRATOR_AVERAGE_AWARD: "arbitrator_average_award",
  ARBITRATOR_CASE_LISTING: "arbitrator_case_listing",
  RESPONDENT_OUTCOME_ANALYSIS: "respondent_outcome_analysis",
  UNKNOWN: "unknown",
};

/**
 * Extract name from a query using a variety of patterns
 * @param query The query text
 * @returns The extracted name or null if not found
 */
function extractName(query: string): string | null {
  // Look for specific patterns first (these are most likely to be accurate)
  const specificPatterns = [
    // "by John Smith"
    /(?:by|for|from|about|handled by)\s+([A-Za-z\s\.\-']+?)(?:\s+(?:has|have|handled|cases|with|against|and|or|in|the|is|was|did)|$)/i,
    // "John Smith's cases"
    /([A-Za-z\s\.\-']+?)(?:'s cases)/i,
    // "John Smith has handled"
    /([A-Za-z\s\.\-']+?)(?:\s+has handled)/i,
    // "John Smith ruled"
    /([A-Za-z\s\.\-']+?)(?:\s+ruled)/i,
    // "arbitrator John Smith"
    /arbitrator\s+([A-Za-z\s\.\-']+)/i,
    // "cases by John Smith"
    /cases\s+(?:by|of|from|with)\s+([A-Za-z\s\.\-']+)/i,
  ];
  
  for (const pattern of specificPatterns) {
    const match = query.match(pattern);
    if (match && match[1]) {
      const name = match[1].trim();
      // If name length is reasonable (to avoid matching entire sentences)
      if (name.length > 1 && name.length < 40) {
        return name;
      }
    }
  }
  
  // Direct name recognition for simple queries
  // Match "How many cases has Smith handled?" 
  const simplePatterns = [
    /has\s+([A-Za-z\.\-']+)\s+handled/i,
    /did\s+([A-Za-z\.\-']+)\s+handle/i,
    /for\s+([A-Za-z\.\-']+)/i
  ];
  
  for (const pattern of simplePatterns) {
    const match = query.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  
  // Last resort: look for capitalized words or pairs of words that might be names
  const words = query.split(/\s+/);
  for (let i = 0; i < words.length; i++) {
    // Check if word starts with capital letter (potential name)
    if (/^[A-Z][a-z\.\-']*$/.test(words[i])) {
      // If it's a standalone name
      if (words[i].length > 2) { // Avoid short words like "A", "I", etc.
        return words[i];
      }
      
      // Check for first name + last name pattern
      if (i < words.length - 1 && /^[A-Z][a-z\.\-']*$/.test(words[i+1])) {
        return `${words[i]} ${words[i+1]}`;
      }
    }
  }
  
  return null;
}

/**
 * Extract respondent name from a query 
 * @param query The query text
 * @returns The extracted respondent name or null if not found
 */
function extractRespondentName(query: string): string | null {
  // Common respondent name extraction patterns
  const patterns = [
    /(?:against|involving|with respondent|company)\s+([A-Za-z\s\.]+?)(?:\s+(?:as|and|or|in|the|by|with)|$)/i,
    /respondent\s+([A-Za-z\s\.]+)/i,
  ];
  
  for (const pattern of patterns) {
    const match = query.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
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
    
    // How many cases has X handled?
    if (
      (lowerQuery.includes("how many") || lowerQuery.includes("number of")) &&
      (lowerQuery.includes("case") || lowerQuery.includes("cases"))
    ) {
      type = QUERY_TYPES.ARBITRATOR_CASE_COUNT;
      
      // Extract name from "How many cases has [name] handled?"
      const hasPattern = /has\s+([A-Za-z\s\.\-']+)\s+(?:handled|overseen|arbitrated|managed)/i;
      const didPattern = /did\s+([A-Za-z\s\.\-']+)\s+(?:handle|oversee|arbitrate|manage)/i;
      const byPattern = /(?:by|from|with)\s+([A-Za-z\s\.\-']+)(?:\s|$)/i;
      
      let match = query.match(hasPattern) || query.match(didPattern) || query.match(byPattern);
      
      if (match && match[1]) {
        arbitratorName = match[1].trim();
      } else {
        // Last resort: look for capitalized words after common phrases
        const words = query.split(/\s+/);
        for (let i = 0; i < words.length; i++) {
          if (words[i].toLowerCase() === "has" || words[i].toLowerCase() === "by") {
            if (i + 1 < words.length && /^[A-Z]/.test(words[i+1])) {
              arbitratorName = words[i+1];
              if (i + 2 < words.length && /^[A-Z]/.test(words[i+2])) {
                arbitratorName += " " + words[i+2];
              }
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
      // Extract arbitrator name from "cases handled by [name]"
      const byPattern = /(?:handled|overseen|arbitrated|managed)\s+by\s+([A-Za-z\s\.\-']+)(?:\s|$)/i;
      const forPattern = /outcomes\s+for\s+([A-Za-z\s\.\-']+)(?:\s|$)/i;
      
      const match = query.match(byPattern) || query.match(forPattern);
      
      if (match && match[1]) {
        arbitratorName = match[1].trim();
        type = QUERY_TYPES.ARBITRATOR_OUTCOME_ANALYSIS;
      } else {
        // Check for respondent patterns
        const respPattern = /(?:involving|with|against|for|by)\s+(?:respondent|company)\s+([A-Za-z\s\.\-']+)(?:\s|$)/i;
        const companyMatch = query.match(respPattern);
        
        if (companyMatch && companyMatch[1]) {
          respondentName = companyMatch[1].trim();
          type = QUERY_TYPES.RESPONDENT_OUTCOME_ANALYSIS;
        } else {
          type = QUERY_TYPES.ARBITRATOR_OUTCOME_ANALYSIS;
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
      const byPattern = /(?:given|awarded|granted|authorized)\s+by\s+([A-Za-z\s\.\-']+)(?:\s|$)/i;
      const ofPattern = /(?:award|amount).+?\s+of\s+([A-Za-z\s\.\-']+)(?:\s|$)/i;
      
      const match = query.match(byPattern) || query.match(ofPattern);
      
      if (match && match[1]) {
        arbitratorName = match[1].trim();
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
    
    // List the cases handled by X.
    else if (
      (lowerQuery.includes("list") || 
       lowerQuery.includes("show") || 
       lowerQuery.includes("what case") || 
       lowerQuery.includes("which case") ||
       lowerQuery.includes("display"))
    ) {
      type = QUERY_TYPES.ARBITRATOR_CASE_LISTING;
      
      // Extract name from "cases handled by [name]"
      const byPattern = /(?:handled|overseen|arbitrated|managed)\s+by\s+([A-Za-z\s\.\-']+)(?:\s|$)/i;
      const ofPattern = /(?:cases|arbitrations).+?\s+of\s+([A-Za-z\s\.\-']+)(?:\s|$)/i;
      
      const match = query.match(byPattern) || query.match(ofPattern);
      
      if (match && match[1]) {
        arbitratorName = match[1].trim();
      } else {
        // Last resort: look for capitalized words after keywords
        const words = query.split(/\s+/);
        for (let i = 0; i < words.length; i++) {
          if (words[i].toLowerCase() === "by" || words[i].toLowerCase() === "arbitrator") {
            if (i + 1 < words.length && /^[A-Z]/.test(words[i+1])) {
              arbitratorName = words[i+1];
              if (i + 2 < words.length && /^[A-Z]/.test(words[i+2])) {
                arbitratorName += " " + words[i+2];
              }
              break;
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
      arbitratorName = extractName(query);
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
        
        // First, get the count of cases with this arbitrator name
        const result = await db
          .select({ count: sql`COUNT(*)` })
          .from(arbitrationCases)
          .where(sql`LOWER(arbitrator_name) LIKE LOWER(${'%' + (arbitratorName ? arbitratorName : '') + '%'})`)
          .execute();
        
        const count = Number(result[0]?.count || 0);
        
        // If we have a lot of matching cases, the arbitrator name might be too general (like "Smith")
        // Let's check if there are multiple arbitrators that match
        if (count > 5) {
          // Get distinct arbitrator names that match
          const distinctNames = await db
            .select({ 
              name: arbitrationCases.arbitratorName,
              count: sql`COUNT(*)`
            })
            .from(arbitrationCases)
            .where(sql`LOWER(arbitrator_name) LIKE LOWER(${'%' + (arbitratorName ? arbitratorName : '') + '%'})`)
            .groupBy(arbitrationCases.arbitratorName)
            .orderBy(sql`COUNT(*)`, "desc")
            .limit(5)
            .execute();
          
          // If we found multiple distinct names, provide data for each
          if (distinctNames.length > 1) {
            let message = `I found ${distinctNames.length} arbitrators matching "${arbitratorName}":\n\n`;
            
            distinctNames.forEach((item) => {
              message += `- ${item.name}: ${item.count} cases\n`;
            });
            
            // If there are more distinct names than we showed
            if (distinctNames.length === 5) {
              const totalDistinct = await db
                .select({ 
                  countDistinct: sql`COUNT(DISTINCT arbitrator_name)` 
                })
                .from(arbitrationCases)
                .where(sql`LOWER(arbitrator_name) LIKE LOWER(${'%' + (arbitratorName ? arbitratorName : '') + '%'})`)
                .execute();
              
              const totalNames = Number(totalDistinct[0]?.countDistinct || 0);
              
              if (totalNames > 5) {
                message += `\nThere are ${totalNames - 5} more arbitrators matching this name. Please provide a more specific name to narrow down the results.`;
              }
            }
            
            return {
              data: { 
                count: count,
                distinctNames: distinctNames.map(item => ({
                  name: item.name,
                  count: Number(item.count)
                }))
              },
              message: message,
            };
          }
        }
        
        // If we only have one name match or a small number of cases, just return the count
        return {
          data: { count },
          message: `${arbitratorName} has handled ${count} arbitration cases.`,
        };
      }
      
      case QUERY_TYPES.ARBITRATOR_OUTCOME_ANALYSIS: {
        if (!arbitratorName) {
          return { data: null, message: "No arbitrator name specified in the query." };
        }
        
        // First, get the count of cases
        const countResult = await db
          .select({ count: sql`COUNT(*)` })
          .from(arbitrationCases)
          .where(sql`LOWER(arbitrator_name) LIKE LOWER(${'%' + (arbitratorName ? arbitratorName : '') + '%'})`)
          .execute();
        
        const totalCount = Number(countResult[0]?.count || 0);
        
        // Check if there are multiple arbitrators that match
        if (totalCount > 5) {
          // Get distinct arbitrator names
          const distinctNames = await db
            .select({ 
              name: arbitrationCases.arbitratorName,
              count: sql`COUNT(*)`
            })
            .from(arbitrationCases)
            .where(sql`LOWER(arbitrator_name) LIKE LOWER(${'%' + (arbitratorName ? arbitratorName : '') + '%'})`)
            .groupBy(arbitrationCases.arbitratorName)
            .orderBy(sql`COUNT(*)`, "desc")
            .limit(5)
            .execute();
          
          // If we found multiple names, ask for clarification
          if (distinctNames.length > 1) {
            let message = `I found ${distinctNames.length} arbitrators matching "${arbitratorName}":\n\n`;
            
            distinctNames.forEach((item) => {
              message += `- ${item.name}: ${item.count} cases\n`;
            });
            
            message += `\nPlease specify which arbitrator you are interested in for outcome analysis.`;
            
            return {
              data: { 
                distinctNames: distinctNames.map(item => ({
                  name: item.name,
                  count: Number(item.count)
                }))
              },
              message: message,
            };
          }
        }
        
        // If we get here, we either have a specific name or need to analyze all matches
        // Get outcomes grouped by disposition
        const results = await db
          .select({
            disposition: arbitrationCases.disposition,
            count: sql`COUNT(*)`,
          })
          .from(arbitrationCases)
          .where(sql`LOWER(arbitrator_name) LIKE LOWER(${'%' + (arbitratorName ? arbitratorName : '') + '%'})`)
          .groupBy(arbitrationCases.disposition)
          .execute();
        
        if (results.length === 0) {
          return {
            data: { outcomes: [] },
            message: `No cases found for arbitrator ${arbitratorName}.`,
          };
        }
        
        // Format the results
        const outcomes = results.map((r) => ({
          disposition: r.disposition || "Unknown",
          count: Number(r.count),
        }));
        
        // Create a summary message
        const totalCases = outcomes.reduce((sum, o) => sum + o.count, 0);
        let message = `${arbitratorName} has handled ${totalCases} cases with the following outcomes:\n`;
        
        outcomes.forEach((o) => {
          const percentage = ((o.count / totalCases) * 100).toFixed(1);
          message += `- ${o.disposition}: ${o.count} cases (${percentage}%)\n`;
        });
        
        return {
          data: { outcomes },
          message,
        };
      }
      
      case QUERY_TYPES.ARBITRATOR_AVERAGE_AWARD: {
        if (!arbitratorName) {
          return { data: null, message: "No arbitrator name specified in the query." };
        }
        
        // Build the query
        let query = db
          .select({
            avgAward: sql`AVG(NULLIF(award_amount, '')::numeric)`,
            countCases: sql`COUNT(*)`,
            countWithAward: sql`COUNT(NULLIF(award_amount, ''))`,
          })
          .from(arbitrationCases)
          .where(sql`LOWER(arbitrator_name) LIKE LOWER(${'%' + (arbitratorName ? arbitratorName : '') + '%'})`);
        
        // Add disposition filter if provided
        if (disposition) {
          const dispositionValue = disposition; // Non-null assertion
          query = query.where(sql`LOWER(disposition) LIKE LOWER(${'%' + dispositionValue + '%'})`) as any;
        }
        
        const result = await query.execute();
        
        if (!result.length || result[0].countCases === 0) {
          return {
            data: null,
            message: `No cases found for arbitrator ${arbitratorName}${
              disposition ? ` with disposition containing "${disposition}"` : ""
            }.`,
          };
        }
        
        const { avgAward, countCases, countWithAward } = result[0];
        
        if (countWithAward === 0) {
          return {
            data: { avgAward: 0, countCases: Number(countCases), countWithAward: 0 },
            message: `${arbitratorName} has handled ${countCases} cases${
              disposition ? ` with disposition containing "${disposition}"` : ""
            }, but none have award amount data available.`,
          };
        }
        
        // Format the average award with $ and commas
        const formattedAvgAward = new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
        }).format(Number(avgAward) || 0);
        
        return {
          data: {
            avgAward: Number(avgAward) || 0,
            countCases: Number(countCases),
            countWithAward: Number(countWithAward),
          },
          message: `${arbitratorName} has handled ${countCases} cases${
            disposition ? ` with disposition containing "${disposition}"` : ""
          }. The average award amount is ${formattedAvgAward} (based on ${countWithAward} cases with award data).`,
        };
      }
      
      case QUERY_TYPES.ARBITRATOR_CASE_LISTING: {
        if (!arbitratorName) {
          return { data: null, message: "No arbitrator name specified in the query." };
        }
        
        // Get the list of cases
        const cases = await db
          .select({
            caseId: arbitrationCases.caseId,
            // Use the column names exactly as they are in the schema
            respondentName: arbitrationCases.respondentName,
            filingDate: arbitrationCases.filingDate,
            disposition: arbitrationCases.disposition,
            caseType: arbitrationCases.caseType,
          })
          .from(arbitrationCases)
          .where(sql`LOWER(arbitrator_name) LIKE LOWER(${'%' + (arbitratorName ? arbitratorName : '') + '%'})`)
          .limit(50) // Limit to prevent extremely large results
          .execute();
        
        if (cases.length === 0) {
          return {
            data: { cases: [] },
            message: `No cases found for arbitrator ${arbitratorName}.`,
          };
        }
        
        let message = `Cases handled by ${arbitratorName} (showing ${
          cases.length >= 50 ? "first 50" : "all " + cases.length
        }):\n\n`;
        
        cases.forEach((c, i) => {
          message += `${i + 1}. Case ID: ${c.caseId}\n`;
          message += `   Respondent: ${c.respondentName || "Unknown"}\n`;
          message += `   Filing Date: ${c.filingDate || "Unknown"}\n`;
          message += `   Disposition: ${c.disposition || "Unknown"}\n`;
          message += `   Case Type: ${c.caseType || "Unknown"}\n\n`;
        });
        
        if (cases.length >= 50) {
          message += "Note: Only showing the first 50 cases. The arbitrator may have handled more cases.";
        }
        
        return {
          data: { cases },
          message,
        };
      }
      
      case QUERY_TYPES.RESPONDENT_OUTCOME_ANALYSIS: {
        if (!respondentName) {
          return { data: null, message: "No respondent name specified in the query." };
        }
        
        // Build the query
        let query = db
          .select({
            disposition: arbitrationCases.disposition,
            count: sql`COUNT(*)`,
          })
          .from(arbitrationCases)
          .where(sql`LOWER(respondent_name) LIKE LOWER(${'%' + (respondentName ? respondentName : '') + '%'})`);
        
        // Add arbitrator filter if provided
        if (arbitratorName) {
          const arbitratorValue = arbitratorName; // Non-null assertion
          query = query.where(sql`LOWER(arbitrator_name) LIKE LOWER(${'%' + arbitratorValue + '%'})`) as any;
        }
        
        const results = await query.groupBy(arbitrationCases.disposition).execute();
        
        if (results.length === 0) {
          return {
            data: { outcomes: [] },
            message: `No cases found for respondent ${respondentName}${
              arbitratorName ? ` with arbitrator ${arbitratorName}` : ""
            }.`,
          };
        }
        
        // Format the results
        const outcomes = results.map((r) => ({
          disposition: r.disposition || "Unknown",
          count: Number(r.count),
        }));
        
        // Create a summary message
        const totalCases = outcomes.reduce((sum, o) => sum + o.count, 0);
        let message = `${respondentName} has been involved in ${totalCases} cases${
          arbitratorName ? ` with arbitrator ${arbitratorName}` : ""
        }. The outcomes are:\n`;
        
        outcomes.forEach((o) => {
          const percentage = ((o.count / totalCases) * 100).toFixed(1);
          message += `- ${o.disposition}: ${o.count} cases (${percentage}%)\n`;
        });
        
        return {
          data: { outcomes },
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