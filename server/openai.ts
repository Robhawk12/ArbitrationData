import OpenAI from "openai";

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Process a natural language query directly with OpenAI
 * @param query The natural language query from the user
 * @returns Generated SQL query and direct response
 */
export async function processQueryWithOpenAI(query: string): Promise<{
  response: string;
  sql: string;
}> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are a SQL (postgres) and data visualization expert. Your job is to help the user write a SQL query to retrieve the data they need. The table schema is as follows:

arbitration_cases(
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
  source_file TEXT NOT NULL,
  processing_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  has_discrepancies BOOLEAN NOT NULL DEFAULT false,
  duplicate_of TEXT,
  raw_data TEXT,
  case_type TEXT
);

Only retrieval queries are allowed.

For things like arbitrator, respondent, attorney and other string fields, use the ILIKE operator and
convert both the search term and the field to lowercase using LOWER() function. For example:
LOWER(arbitrator_name) ILIKE LOWER('%search_term%').

Note: Trim whitespace to ensure you're grouping properly. Note, some fields may be null or
have only one value. Ignore suffixes in arbitrators and attorneys. There may be multiple
attorneys in consumer_attorney when searching ie. "how many cases did Thomas Fowler
represent the consumer?" The search name may be the second or third name in the field
separated by commas. Treat companies with Coinbase in it as the same company/respondent.
When answering questions about a specific field, ensure you are selecting the identifying
column (ie. "How many cases has Smith handled?").

If the user asks for a category that is not in the list, infer based on the schema above.

First, write the SQL query that would answer the question, then provide a detailed explanation of the results that would be produced by this query. Format your response in two sections labeled "SQL:" and "Explanation:".`
        },
        {
          role: "user",
          content: query
        }
      ],
      temperature: 0.3,
    });

    const content = response.choices[0].message.content || "";
    
    // Extract SQL and explanation from the response
    const sqlMatch = content.match(/SQL:(.*?)(?=Explanation:|$)/s);
    const sql = sqlMatch ? sqlMatch[1].trim() : "";
    
    return {
      response: content,
      sql: sql
    };
  } catch (error) {
    console.error("Error processing query with OpenAI:", error);
    return {
      response: "I encountered an error while processing your query. Please try again.",
      sql: ""
    };
  }
}

/**
 * Process results from a SQL query to generate a human-friendly response
 * @param query The original user query
 * @param results The SQL query results
 * @returns Human-readable analysis of the query results
 */
export async function processResultsWithOpenAI(query: string, results: any): Promise<string> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are an expert in arbitration case data analysis. Your task is to interpret the results of a database query and provide a clear, informative response.

When presenting results:
- Format monetary values as currency: $1,234.56
- Present percentages with one decimal point: 45.2%
- Round large numbers appropriately for readability
- Provide context by comparing values when relevant
- Be factual and neutral in your analysis

Make your response conversational and human-friendly. If the results are empty or seem incorrect, mention this in your response.`
        },
        {
          role: "user",
          content: `The user asked: "${query}"\n\nHere are the query results: ${JSON.stringify(results, null, 2)}`
        }
      ],
      temperature: 0.4,
    });

    return response.choices[0].message.content || "I'm unable to analyze the results at the moment.";
  } catch (error) {
    console.error("Error processing results with OpenAI:", error);
    return "I encountered an error while analyzing the results. Please try again.";
  }
}