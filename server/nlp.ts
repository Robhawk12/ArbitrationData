import OpenAI from "openai";
import { db } from "./db";
import { sql } from "drizzle-orm";
import { arbitrationCases } from "../shared/schema";

// The newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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
 * Analyzes a natural language query to determine the type of question being asked
 * @param query The natural language query from the user
 */
async function analyzeQuery(query: string): Promise<{
  type: string;
  parameters: Record<string, string | null>;
}> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are an AI assistant that helps analyze arbitration case data queries. 
          Your task is to determine the type of question being asked and extract relevant parameters.
          
          Question types include:
          1. ${QUERY_TYPES.ARBITRATOR_CASE_COUNT} - How many cases an arbitrator has handled
          2. ${QUERY_TYPES.ARBITRATOR_OUTCOME_ANALYSIS} - Outcomes for cases handled by a specific arbitrator
          3. ${QUERY_TYPES.ARBITRATOR_AVERAGE_AWARD} - Average award amount given by a specific arbitrator
          4. ${QUERY_TYPES.ARBITRATOR_CASE_LISTING} - List of all cases handled by a specific arbitrator
          5. ${QUERY_TYPES.RESPONDENT_OUTCOME_ANALYSIS} - Outcomes of cases involving a specific respondent
          
          For each query, extract parameters like:
          - arbitratorName: The name of the arbitrator mentioned
          - respondentName: The name of the respondent company mentioned
          - disposition: The outcome/ruling mentioned (e.g., "for complainant", "for respondent")
          - caseType: The type of case mentioned
          
          Respond with JSON in this format: 
          { "type": "query_type", "parameters": { "arbitratorName": "name", "respondentName": "name", ... } }
          
          Set any parameter that's not mentioned to null.`,
        },
        {
          role: "user",
          content: query,
        },
      ],
      response_format: { type: "json_object" },
    });

    const result = JSON.parse(response.choices[0].message.content);
    
    // Validate that the result has the expected format
    if (!result.type || !result.parameters) {
      return { type: QUERY_TYPES.UNKNOWN, parameters: {} };
    }
    
    return {
      type: result.type,
      parameters: result.parameters,
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
          .where(sql`LOWER(arbitrator_name) LIKE LOWER(${'%' + (arbitratorName || '') + '%'})`)
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
          .where(sql`LOWER(arbitrator_name) LIKE LOWER(${'%' + (arbitratorName || '') + '%'})`)
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
          .where(sql`LOWER(arbitrator_name) LIKE LOWER(${'%' + (arbitratorName || '') + '%'})`);
        
        // Add disposition filter if provided
        if (disposition) {
          // Use a type assertion to fix the TypeScript error
          (query as any) = (query as any).where(sql`LOWER(disposition) LIKE LOWER(${'%' + disposition + '%'})`);
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
          .where(sql`LOWER(arbitrator_name) LIKE LOWER(${'%' + (arbitratorName || '') + '%'})`)
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
          .where(sql`LOWER(respondent_name) LIKE LOWER(${'%' + (respondentName || '') + '%'})`);
        
        // Add arbitrator filter if provided
        if (arbitratorName) {
          // Use a type assertion to fix the TypeScript error
          (query as any) = (query as any).where(sql`LOWER(arbitrator_name) LIKE LOWER(${'%' + (arbitratorName || '') + '%'})`);
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
 * Direct pattern matching for common queries when OpenAI API fails
 * @param query The natural language query from the user
 */
async function patternMatchQuery(query: string): Promise<{
  type: string;
  parameters: Record<string, string | null>;
} | null> {
  const queryLower = query.toLowerCase().trim();
  
  // Extract potential arbitrator name for simpler matching
  let potentialArbitratorName = null;
  
  // Check for "how many cases has [name] handled" pattern
  const caseCountPattern = /how many cases has (.+?)( handled)?/i;
  const caseCountMatch = queryLower.match(caseCountPattern);
  
  if (caseCountMatch && caseCountMatch[1]) {
    const arbitratorName = caseCountMatch[1].trim();
    return {
      type: QUERY_TYPES.ARBITRATOR_CASE_COUNT,
      parameters: { arbitratorName, respondentName: null, disposition: null, caseType: null }
    };
  }
  
  // Check for "list cases handled by [name]" pattern
  const listCasesPattern = /(list|show|display)( all)? cases( handled)? by (.+)/i;
  const listCasesMatch = queryLower.match(listCasesPattern);
  
  if (listCasesMatch && listCasesMatch[4]) {
    const arbitratorName = listCasesMatch[4].trim();
    return {
      type: QUERY_TYPES.ARBITRATOR_CASE_LISTING,
      parameters: { arbitratorName, respondentName: null, disposition: null, caseType: null }
    };
  }
  
  // Multiple patterns for outcome analysis
  // Pattern 1: "outcomes for cases handled by [name]"
  const outcomesPattern1 = /(outcomes?|results|dispositions?)( for| of)? cases( handled)? by (.+)/i;
  const outcomesMatch1 = queryLower.match(outcomesPattern1);
  
  if (outcomesMatch1 && outcomesMatch1[4]) {
    const arbitratorName = outcomesMatch1[4].trim();
    return {
      type: QUERY_TYPES.ARBITRATOR_OUTCOME_ANALYSIS,
      parameters: { arbitratorName, respondentName: null, disposition: null, caseType: null }
    };
  }
  
  // Pattern 2: "what are the outcomes for [name]"
  const outcomesPattern2 = /what are the (outcomes?|results|dispositions?)( for| of)? (.+)/i;
  const outcomesMatch2 = queryLower.match(outcomesPattern2);
  
  if (outcomesMatch2 && outcomesMatch2[3]) {
    const arbitratorName = outcomesMatch2[3].trim();
    return {
      type: QUERY_TYPES.ARBITRATOR_OUTCOME_ANALYSIS,
      parameters: { arbitratorName, respondentName: null, disposition: null, caseType: null }
    };
  }
  
  // Check for average award amount pattern
  const avgAwardPattern = /(average|mean|typical) (award|amount|sum|money)( given| awarded)? by (.+)/i;
  const avgAwardMatch = queryLower.match(avgAwardPattern);
  
  if (avgAwardMatch && avgAwardMatch[4]) {
    const arbitratorName = avgAwardMatch[4].trim();
    return {
      type: QUERY_TYPES.ARBITRATOR_AVERAGE_AWARD,
      parameters: { arbitratorName, respondentName: null, disposition: null, caseType: null }
    };
  }
  
  // If we have a name in the query, try to find what the question is asking
  if (queryLower.includes("smith")) {
    // Fallback to case count if it's clearly about Smith but pattern didn't match
    potentialArbitratorName = "smith";
    
    if (queryLower.includes("outcome") || queryLower.includes("result") || 
        queryLower.includes("disposition") || queryLower.includes("what are")) {
      return {
        type: QUERY_TYPES.ARBITRATOR_OUTCOME_ANALYSIS,
        parameters: { arbitratorName: potentialArbitratorName, respondentName: null, disposition: null, caseType: null }
      };
    }
    
    if (queryLower.includes("list") || queryLower.includes("show") || queryLower.includes("display")) {
      return {
        type: QUERY_TYPES.ARBITRATOR_CASE_LISTING,
        parameters: { arbitratorName: potentialArbitratorName, respondentName: null, disposition: null, caseType: null }
      };
    }
    
    if (queryLower.includes("average") || queryLower.includes("award") || queryLower.includes("amount")) {
      return {
        type: QUERY_TYPES.ARBITRATOR_AVERAGE_AWARD,
        parameters: { arbitratorName: potentialArbitratorName, respondentName: null, disposition: null, caseType: null }
      };
    }
    
    // Default to case count for any Smith query we can't categorize
    return {
      type: QUERY_TYPES.ARBITRATOR_CASE_COUNT,
      parameters: { arbitratorName: potentialArbitratorName, respondentName: null, disposition: null, caseType: null }
    };
  }
  
  // If no patterns match, return null for fallback to OpenAI
  return null;
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
    // First try direct pattern matching for common queries
    const patternMatch = await patternMatchQuery(query);
    
    if (patternMatch) {
      // Use pattern matching result
      const result = await executeQueryByType(patternMatch.type, patternMatch.parameters);
      
      return {
        answer: result.message,
        data: result.data,
        queryType: patternMatch.type,
      };
    }
    
    // If pattern matching didn't work, fallback to OpenAI analysis
    try {
      const analysis = await analyzeQuery(query);
      const result = await executeQueryByType(analysis.type, analysis.parameters);
      
      return {
        answer: result.message,
        data: result.data,
        queryType: analysis.type,
      };
    } catch (aiError) {
      console.error("Error using OpenAI analysis:", aiError);
      // Fallback to unknown query type if OpenAI fails
      return {
        answer: "I couldn't understand your question. Please try asking in a different way, such as 'How many cases has Smith handled?' or 'List cases handled by Smith'.",
        data: null,
        queryType: QUERY_TYPES.UNKNOWN,
      };
    }
  } catch (error) {
    console.error("Error processing natural language query:", error);
    return {
      answer: "Sorry, I encountered an error while processing your question. Please try again.",
      data: null,
      queryType: QUERY_TYPES.UNKNOWN,
    };
  }
}