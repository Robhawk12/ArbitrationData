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
  // Common name extraction patterns
  const patterns = [
    /(?:by|for|from|about|handled by)\s+([A-Za-z\s\.]+?)(?:\s+(?:has|have|handled|cases|with|against|and|or|in|the)|$)/i,
    /([A-Za-z\s\.]+?)(?:'s cases)/i,
    /([A-Za-z\s\.]+?)(?:\s+has handled)/i,
    /([A-Za-z\s\.]+?)(?:\s+ruled)/i,
    /arbitrator\s+([A-Za-z\s\.]+)/i,
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
    
    // Default parameters
    let type = QUERY_TYPES.UNKNOWN;
    let arbitratorName = extractName(query);
    let respondentName = extractRespondentName(query);
    let disposition = null;
    let caseType = null;
    
    // Determine query type based on keywords and patterns
    
    // How many cases has X handled?
    if (
      (lowerQuery.includes("how many") || lowerQuery.includes("number of")) &&
      (lowerQuery.includes("case") || lowerQuery.includes("cases"))
    ) {
      type = QUERY_TYPES.ARBITRATOR_CASE_COUNT;
    }
    
    // What are the outcomes for cases handled by X?
    else if (
      (lowerQuery.includes("outcome") || lowerQuery.includes("result") || lowerQuery.includes("ruling")) &&
      !lowerQuery.includes("average") &&
      !lowerQuery.includes("award amount")
    ) {
      if (respondentName) {
        type = QUERY_TYPES.RESPONDENT_OUTCOME_ANALYSIS;
      } else {
        type = QUERY_TYPES.ARBITRATOR_OUTCOME_ANALYSIS;
      }
    }
    
    // What is the average award amount given by X?
    else if (
      (lowerQuery.includes("average") || lowerQuery.includes("mean")) &&
      (lowerQuery.includes("award") || lowerQuery.includes("amount") || lowerQuery.includes("damages"))
    ) {
      type = QUERY_TYPES.ARBITRATOR_AVERAGE_AWARD;
      
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
        
        const result = await db
          .select({ count: sql`COUNT(*)` })
          .from(arbitrationCases)
          .where(sql`LOWER(arbitrator_name) LIKE LOWER(${'%' + (arbitratorName ? arbitratorName : '') + '%'})`)
          .execute();
        
        const count = Number(result[0]?.count || 0);
        
        return {
          data: { count },
          message: `${arbitratorName} has handled ${count} arbitration cases.`,
        };
      }
      
      case QUERY_TYPES.ARBITRATOR_OUTCOME_ANALYSIS: {
        if (!arbitratorName) {
          return { data: null, message: "No arbitrator name specified in the query." };
        }
        
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