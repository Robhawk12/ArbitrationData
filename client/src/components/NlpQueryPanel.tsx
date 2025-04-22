import { useState } from "react";
import { AlertTriangle } from "lucide-react";

interface NlpQueryPanelProps {
  className?: string;
}

// Error types that we want to handle specifically
type ErrorType = 
  | "rate_limit" 
  | "api_key" 
  | "general";

interface ErrorState {
  type: ErrorType;
  message: string;
}

export default function NlpQueryPanel({ className = "" }: NlpQueryPanelProps) {
  const [query, setQuery] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<ErrorState | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!query.trim()) {
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch("/api/nlp-query", {
        method: "POST",
        body: JSON.stringify({ query }),
        headers: {
          "Content-Type": "application/json",
        },
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        // Try to parse the error from the response
        if (data && typeof data === 'object') {
          if ('errorType' in data && 'error' in data) {
            // Server has already classified the error type for us
            setError({
              type: data.errorType as ErrorType,
              message: data.error as string
            });
          } else if ('error' in data) {
            const errorMessage = data.error as string;
            
            // Fallback classification if the server didn't provide an errorType
            if (errorMessage.includes("quota") || errorMessage.includes("rate limit") || errorMessage.includes("429")) {
              setError({
                type: "rate_limit",
                message: "OpenAI API rate limit exceeded. Please try again later or contact support to update the API quota."
              });
            } else if (errorMessage.includes("invalid API key") || errorMessage.includes("authentication")) {
              setError({
                type: "api_key",
                message: "API authentication error. The OpenAI API key may be invalid or expired."
              });
            } else {
              setError({
                type: "general",
                message: errorMessage
              });
            }
          } else {
            throw new Error(`HTTP error ${response.status}`);
          }
          return;
        } else {
          throw new Error(`HTTP error ${response.status}`);
        }
      }
      
      if (data && typeof data === 'object' && 'answer' in data) {
        setAnswer(data.answer as string);
      } else {
        setError({
          type: "general",
          message: "Received an invalid response format from the server."
        });
      }
    } catch (err) {
      console.error("Failed to process natural language query:", err);
      setError({
        type: "general",
        message: "An error occurred while processing your question. Please try again."
      });
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
        <div className={`border rounded p-4 mt-4 flex items-start gap-3 ${
          error.type === "rate_limit" 
            ? "bg-amber-50 border-amber-200 text-amber-700" 
            : error.type === "api_key"
              ? "bg-red-50 border-red-200 text-red-700"
              : "bg-red-50 border-red-200 text-red-600"
        }`}>
          <AlertTriangle className="h-5 w-5 mt-0.5 flex-shrink-0" />
          <div>
            <h4 className="font-medium mb-1">
              {error.type === "rate_limit" 
                ? "API Rate Limit Exceeded" 
                : error.type === "api_key" 
                  ? "API Key Error"
                  : "Error Processing Query"}
            </h4>
            <p className="text-sm">{error.message}</p>
            {error.type === "rate_limit" && (
              <p className="text-xs mt-2">
                This typically happens when the OpenAI API quota has been reached. 
                Please try again later or contact the administrator to update the API quota.
              </p>
            )}
            {error.type === "api_key" && (
              <p className="text-xs mt-2">
                The API key may be invalid or expired. Please contact the administrator to update the API key.
              </p>
            )}
          </div>
        </div>
      )}
      
      {answer && !error && (
        <div className="bg-[#e8f4ee] border border-[#b8dbca] p-4 rounded mt-4">
          <h3 className="font-medium text-[#217346] mb-2">Answer:</h3>
          <div className="whitespace-pre-line text-neutral-700">
            {answer}
          </div>
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
        </ul>
      </div>
    </div>
  );
}