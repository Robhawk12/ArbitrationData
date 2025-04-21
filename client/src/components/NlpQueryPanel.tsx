import { useState } from "react";

// Define the types for our API response
interface QueryResult {
  answer_type: "count" | "average" | "list" | "error";
  value?: number;
  items?: string[];
  summary: string;
  error?: string;
  sql_query?: string;
}

interface NlpQueryPanelProps {
  className?: string;
}

export default function NlpQueryPanel({ className = "" }: NlpQueryPanelProps) {
  const [query, setQuery] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSqlQuery, setShowSqlQuery] = useState(false);
  const [useEnhancedMode, setUseEnhancedMode] = useState(true);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!query.trim()) {
      return;
    }
    
    setIsLoading(true);
    setError(null);
    setShowSqlQuery(false);
    setQueryResult(null);
    
    try {
      // Decide which endpoint to use based on enhanced mode toggle
      const endpoint = useEnhancedMode ? "/api/query_ai" : "/api/nlp-query";
      const bodyKey = useEnhancedMode ? "question" : "query";
      
      const response = await fetch(endpoint, {
        method: "POST",
        body: JSON.stringify({ [bodyKey]: query }),
        headers: {
          "Content-Type": "application/json",
        },
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }
      
      const data = await response.json();
      
      if (useEnhancedMode) {
        // Enhanced mode response handling
        if (data && typeof data === 'object' && 'summary' in data) {
          setAnswer(data.summary);
          setQueryResult(data as QueryResult);
        } else {
          setError("Received an invalid response format from the server.");
        }
      } else {
        // Legacy mode response handling
        if (data && typeof data === 'object' && 'answer' in data) {
          setAnswer(data.answer as string);
        } else {
          setError("Received an invalid response format from the server.");
        }
      }
    } catch (err) {
      console.error("Failed to process natural language query:", err);
      setError("An error occurred while processing your question. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={`bg-white rounded-lg shadow-md p-4 ${className}`}>
      
      <form onSubmit={handleSubmit} className="mb-4">
        <div className="flex flex-col space-y-2">
          <label htmlFor="nlp-query" className="text-sm font-medium text-neutral-700">
            Ask a question
          </label>
          
          <div className="flex space-x-2">
            <input
              id="nlp-query"
              type="text"
              className="flex-1 border border-[#b8dbca] rounded p-2 focus:outline-none focus:border-[#217346] focus:ring-1 focus:ring-[#e8f4ee]"
              placeholder="e.g., How many cases has Smith handled?"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              disabled={isLoading}
            />
            
            <button
              type="submit"
              className={`bg-[#14863e] text-white px-4 py-2 rounded hover:bg-[#0a6d2c] transition-colors duration-200 font-semibold shadow-md ${isLoading || !query.trim() ? 'opacity-60 cursor-not-allowed' : ''}`}
              style={{ textShadow: '0 1px 1px rgba(0,0,0,0.2)' }}
              disabled={isLoading || !query.trim()}
            >
              {isLoading ? (
                <span className="flex items-center">
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Processing...
                </span>
              ) : (
                "Ask"
              )}
            </button>
          </div>
          
          <p className="text-[8pt] text-neutral-400">
            Examples: "How many cases has Smith handled?", "What are the outcomes for cases handled by Becker?", "Average award amount given by Johnson"
          </p>
        </div>
      </form>
      
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded mt-4">
          {error}
        </div>
      )}
      
      {/* Enhanced mode toggle */}
      <div className="flex items-center justify-end mb-2">
        <span className="text-xs text-neutral-500 mr-2">Enhanced AI Mode</span>
        <div 
          className={`relative inline-block w-10 h-5 rounded-full cursor-pointer transition-colors duration-200 ease-in-out ${useEnhancedMode ? 'bg-[#14863e]' : 'bg-gray-300'}`}
          onClick={() => setUseEnhancedMode(!useEnhancedMode)}
        >
          <span 
            className={`absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ease-in-out ${useEnhancedMode ? 'transform translate-x-5' : ''}`}
          ></span>
        </div>
      </div>
      
      {answer && !error && (
        <div className="bg-[#e8f4ee] border border-[#b8dbca] p-4 rounded mt-4">
          <h3 className="font-medium text-[#217346] mb-2">Answer:</h3>
          <div className="whitespace-pre-line text-neutral-700">
            {answer}
          </div>
          
          {/* Display list items if available */}
          {queryResult?.items && queryResult.items.length > 0 && (
            <div className="mt-3 border-t border-[#b8dbca] pt-3">
              <h4 className="font-medium text-[#217346] mb-2">Results:</h4>
              <ul className="list-disc pl-5 mt-1 space-y-1 max-h-60 overflow-y-auto text-sm">
                {queryResult.items.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </div>
          )}
          
          {/* SQL Query display for enhanced mode */}
          {useEnhancedMode && queryResult?.sql_query && (
            <div className="mt-3">
              <button
                onClick={() => setShowSqlQuery(!showSqlQuery)}
                className="text-xs text-[#217346] underline hover:text-[#14863e] transition-colors duration-200"
              >
                {showSqlQuery ? "Hide SQL Query" : "Show SQL Query"}
              </button>
              
              {showSqlQuery && (
                <div className="mt-2 bg-neutral-100 p-2 rounded text-xs font-mono overflow-x-auto">
                  {queryResult.sql_query}
                </div>
              )}
            </div>
          )}
        </div>
      )}
      
      <div className="mt-4 text-[8pt] text-neutral-500">
        <p>
          <strong>What you can ask:</strong>
        </p>
        <ul className="list-disc pl-5 mt-1 space-y-1">
          <li>Arbitrator case counts (e.g., "How many cases has [name] handled?")</li>
          <li>Arbitrator outcome analysis (e.g., "What are the outcomes for cases handled by [name]?")</li>
          <li>Arbitrator average awards (e.g., "What is the average award amount given by [name]?")</li>
          <li>Arbitrator case listing (e.g., "List the cases handled by [name]")</li>
          <li>Respondent outcome analysis (e.g., "How many times has [arbitrator] ruled for the consumer against [company]?")</li>
          {useEnhancedMode && (
            <>
              <li className="font-semibold">Enhanced Mode: Ask more complex questions about cases, arbitrators, and respondents!</li>
            </>
          )}
        </ul>
      </div>
    </div>
  );
}