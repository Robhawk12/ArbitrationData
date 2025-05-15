import { db } from "./db";
import { sql } from "drizzle-orm";

/**
 * Execute a time-based analysis query
 * @param year The year to analyze
 * @param timeframe The timeframe description
 * @param disposition The case disposition type
 * @param caseType The case type
 * @param query The original user query
 */
export async function executeTimeBasedAnalysis(
  year: string | null,
  timeframe: string | null,
  disposition: string | null,
  caseType: string | null,
  query: string
): Promise<{ data: any; message: string }> {
  console.log(`Execute time-based analysis: year=${year}, timeframe=${timeframe}, disposition=${disposition}`);
  
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
      // Default
      dispositionCondition = `disposition IS NOT NULL`;
      dispositionDisplay = disposition;
    }
  }
  
  // Directly use a more straightforward approach with prepared SQL statements
  const sqlQuery = `
    SELECT COUNT(*) as case_count 
    FROM arbitration_cases 
    WHERE filing_date IS NOT NULL
    AND ${yearCondition}
    ${disposition ? `AND ${dispositionCondition}` : ''}
    AND (duplicate_of IS NULL OR duplicate_of = '')
  `;
  
  console.log(`Executing SQL query: ${sqlQuery}`);
  
  try {
    // Execute the query directly without prepared statements to avoid type issues
    const result = await db.execute(sql.raw(sqlQuery));
    console.log('Raw query result:', JSON.stringify(result));
    
    // Extract the count from the result in a safer way
    let count = 0;
    
    if (result && Array.isArray(result) && result.length > 0) {
      const firstRow = result[0];
      console.log('First row of result:', firstRow);
      
      // Try different possible column names
      if (firstRow.case_count !== undefined) {
        count = Number(firstRow.case_count);
      } else if (firstRow.count !== undefined) {
        count = Number(firstRow.count);
      } else {
        // If column names don't match expectations, try to get first numeric value
        for (const key in firstRow) {
          if (firstRow[key] !== null && !isNaN(Number(firstRow[key]))) {
            count = Number(firstRow[key]);
            console.log(`Found count in column ${key}: ${count}`);
            break;
          }
        }
      }
    }
    
    console.log(`Final count: ${count}`);
    
    // If we couldn't find a valid count, return an error
    if (isNaN(count)) {
      console.error('Could not extract valid count from query result');
      return {
        data: { count: 0 },
        message: `Error processing query results for ${dispositionDisplay} cases ${timeframeDisplay}.`
      };
    }
    
    return {
      data: { 
        count,
        disposition: disposition || "all",
        timeframe: timeframe || year,
        query
      },
      message: `There ${count === 1 ? 'was' : 'were'} ${count} ${dispositionDisplay ? dispositionDisplay + ' ' : ''}case${count === 1 ? '' : 's'} ${timeframeDisplay}.`
    };
    
  } catch (error) {
    console.error('Error executing time-based query:', error);
    return {
      data: null,
      message: `An error occurred while analyzing cases ${dispositionDisplay} ${timeframeDisplay}.`
    };
  }
}