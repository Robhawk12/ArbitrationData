import OpenAI from "openai";

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Analyze a natural language query using OpenAI to determine intent and required parameters
 * @param query The natural language query to analyze
 * @returns Structured analysis of the query
 */
export async function analyzeQueryWithAI(query: string): Promise<{
  intent: string;
  arbitratorName: string | null;
  respondentName: string | null;
  disposition: string | null;
  caseType: string | null;
  timeframe: string | null;
  confidence: number;
}> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are an expert in analyzing arbitration case data. Your task is to analyze a user query and extract relevant components.
          
Schema for arbitration_cases:
  id SERIAL PRIMARY KEY,
  case_id TEXT UNIQUE NOT NULL,
  forum TEXT NOT NULL,
  arbitrator_name TEXT,
  respondent_name TEXT,
  consumer_attorney TEXT,
  filing_date TIMESTAMP,
  disposition TEXT,
  claim_amount TEXT,
  award_amount TEXT,
  case_type TEXT,
  source_file TEXT NOT NULL,
  processing_date TIMESTAMP,
  has_discrepancies BOOLEAN,
  duplicate_of TEXT,
  raw_data TEXT

Identify the intent and extract relevant entities from the query. Possible intents include:
- ARBITRATOR_CASE_COUNT: Query about how many cases an arbitrator has handled
- ARBITRATOR_OUTCOME_ANALYSIS: Query about outcomes of cases handled by an arbitrator
- ARBITRATOR_AVERAGE_AWARD: Query about average award amounts for an arbitrator
- ARBITRATOR_CASE_LISTING: Query asking to list cases handled by an arbitrator
- RESPONDENT_CASE_COUNT: Query about how many cases involve a specific respondent
- RESPONDENT_OUTCOME_ANALYSIS: Query about outcomes of cases involving a specific respondent
- COMBINED_OUTCOME_ANALYSIS: Query about outcomes of cases with both a specific arbitrator and respondent
- ARBITRATOR_RANKING: Query comparing multiple arbitrators or asking about top arbitrators (e.g., "Which arbitrators award the most?")
- TIME_BASED_ANALYSIS: Query about cases in a specific time period or year (e.g., "How many cases were awarded in 2020?")
- COMPLEX_ANALYSIS: Query requiring complex analysis beyond simple database queries
- UNKNOWN: Query that doesn't fall into any of the above categories

When extracting names, handle variations (Hon., Dr., etc.) and standardize to improve matching.
Provide a confidence score (0-1) indicating your certainty of the analysis.

Return your response as a JSON object with the following structure:
{
  "intent": "INTENT_TYPE",
  "arbitratorName": "Name or null",
  "respondentName": "Name or null",
  "disposition": "Type or null",
  "caseType": "Type or null",
  "timeframe": "Period or null",
  "confidence": 0.8
}`
        },
        {
          role: "user",
          content: query
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });

    // Handle null content by providing a default empty object
    const content = response.choices[0].message.content as string || "{}";
    const result = JSON.parse(content);
    
    return {
      intent: result.intent || "UNKNOWN",
      arbitratorName: result.arbitratorName || null,
      respondentName: result.respondentName || null,
      disposition: result.disposition || null,
      caseType: result.caseType || null,
      timeframe: result.timeframe || null,
      confidence: result.confidence || 0.5,
    };
  } catch (error) {
    console.error("Error analyzing query with AI:", error);
    return {
      intent: "UNKNOWN",
      arbitratorName: null,
      respondentName: null,
      disposition: null,
      caseType: null,
      timeframe: null,
      confidence: 0
    };
  }
}

/**
 * Generate a response to a complex query that can't be easily answered with predefined query types
 * @param query The original user query
 * @param data Relevant data from the database to inform the response
 * @returns AI-generated natural language response
 */
export async function generateComplexQueryResponse(
  query: string,
  data: any
): Promise<string> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are an expert in arbitration case data analysis. You are responding to a user query about arbitration cases.
          
Your job is to provide a clear, concise, and accurate response to the user's query based on the provided data.
Focus on answering exactly what was asked, and be specific about numeric results (counts, percentages, averages).
If specific data is missing or unavailable, acknowledge this limitation in your response.

When presenting metrics:
- Format monetary values as currency: $1,234.56
- Present percentages with one decimal point: 45.2%
- Round large numbers appropriately for readability
- Provide context by comparing values when relevant

Be factual and neutral in your analysis. Do not make assumptions beyond what the data directly supports.`
        },
        {
          role: "user",
          content: `Query: ${query}\n\nAvailable data: ${JSON.stringify(data, null, 2)}`
        }
      ],
      temperature: 0.4,
    });

    return response.choices[0].message.content || "I'm unable to analyze this query at the moment.";
  } catch (error) {
    console.error("Error generating complex query response:", error);
    return "I encountered an error while analyzing this query. Please try again with a different question.";
  }
}

/**
 * Generate SQL for a complex query that doesn't fit the standard query types
 * @param query The user's natural language query
 * @returns SQL query to retrieve the relevant data
 */
export async function generateSQLForQuery(query: string): Promise<{
  sql: string;
  explanation: string;
}> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are an expert SQL developer specializing in PostgreSQL. Your task is to generate SQL for querying arbitration case data.
          
Schema for arbitration_cases:
  id SERIAL PRIMARY KEY,
  case_id TEXT UNIQUE NOT NULL,
  forum TEXT NOT NULL,
  arbitrator_name TEXT,
  respondent_name TEXT,
  consumer_attorney TEXT,
  filing_date TIMESTAMP,
  disposition TEXT,
  claim_amount TEXT,
  award_amount TEXT,
  case_type TEXT,
  source_file TEXT NOT NULL,
  processing_date TIMESTAMP,
  has_discrepancies BOOLEAN,
  duplicate_of TEXT,
  raw_data TEXT

Notes on data:
- For string fields like arbitrator_name and respondent_name, use LOWER() and ILIKE for case-insensitive partial matching
- Always trim whitespace when grouping by string fields
- Handle NULL values appropriately in aggregations
- Some text fields like claim_amount and award_amount may contain monetary values with currency symbols
- For name matching, consider variations in formatting (with/without middle initials)

Generate valid PostgreSQL that answers the user's query. 
For string matching, prefer LOWER(field) ILIKE LOWER('%term%') pattern.
Only write SELECT queries - no INSERT, UPDATE, or DELETE operations.

Return your response as a JSON object with this structure:
{
  "sql": "Your SQL query here",
  "explanation": "Brief explanation of what the query does"
}`
        },
        {
          role: "user",
          content: query
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
    });

    // Handle null content by providing a default empty object
    const content = response.choices[0].message.content as string || "{}";
    const result = JSON.parse(content);
    
    return {
      sql: result.sql || "",
      explanation: result.explanation || "No explanation provided"
    };
  } catch (error) {
    console.error("Error generating SQL for query:", error);
    return {
      sql: "",
      explanation: "Failed to generate SQL for this query"
    };
  }
}