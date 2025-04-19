import { useState } from "react";
import { apiRequest } from "@/lib/queryClient";

interface NlpQueryPanelProps {
  className?: string;
}

export default function NlpQueryPanel({ className = "" }: NlpQueryPanelProps) {
  const [query, setQuery] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!query.trim()) {
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await apiRequest<{
        answer: string;
        data: any;
        queryType: string;
      }>("/api/nlp-query", {
        method: "POST",
        body: JSON.stringify({ query }),
        headers: {
          "Content-Type": "application/json",
        },
      });
      
      setAnswer(response.answer);
    } catch (err) {
      console.error("Failed to process natural language query:", err);
      setError("An error occurred while processing your question. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={`bg-white rounded-lg shadow-md p-4 ${className}`}>
      <h2 className="text-lg font-semibold text-[#217346] mb-4">
        Ask about Arbitration Data
      </h2>
      
      <form onSubmit={handleSubmit} className="mb-4">
        <div className="flex flex-col space-y-2">
          <label htmlFor="nlp-query" className="text-sm text-neutral-500">
            Ask a question in plain English
          </label>
          
          <div className="flex space-x-2">
            <input
              id="nlp-query"
              type="text"
              className="flex-1 border border-[#b8dbca] rounded p-2 focus:outline-none focus:border-[#217346] focus:ring-1 focus:ring-[#e8f4ee]"
              placeholder="e.g., How many cases has John Smith handled?"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              disabled={isLoading}
            />
            
            <button
              type="submit"
              className="bg-[#217346] text-white px-4 py-2 rounded hover:bg-[#19603A] transition-colors duration-200 disabled:opacity-50"
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
            Examples: "How many cases has Arbitrator X handled?", "What are the outcomes for cases handled by Arbitrator Y?", "Average award amount given by Arbitrator Z"
          </p>
        </div>
      </form>
      
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded mt-4">
          {error}
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