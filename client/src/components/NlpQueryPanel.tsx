import { useState } from "react";

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
      const response = await fetch("/api/nlp-query", {
        method: "POST",
        body: JSON.stringify({ query }),
        headers: {
          "Content-Type": "application/json",
        },
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data && typeof data === 'object' && 'answer' in data) {
        setAnswer(data.answer as string);
      } else {
        setError("Received an invalid response format from the server.");
      }
    } catch (err) {
      console.error("Failed to process natural language query:", err);
      setError("An error occurred while processing your question. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={`${className}`}>
      <h2 className="text-2xl font-semibold text-[#217346] mb-6">
        Ask Questions About Arbitration Data
      </h2>
      
      <form onSubmit={handleSubmit} className="mb-6">
        <div className="flex flex-col space-y-3">
          <label htmlFor="nlp-query" className="text-sm text-neutral-600 font-medium">
            Ask a question in plain English
          </label>
          
          <div className="flex space-x-2">
            <input
              id="nlp-query"
              type="text"
              className="flex-1 border border-[#b8dbca] rounded-md p-3 text-lg focus:outline-none focus:border-[#217346] focus:ring-2 focus:ring-[#e8f4ee]"
              placeholder="e.g., How many cases has Smith handled?"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              disabled={isLoading}
            />
            
            <button
              type="submit"
              className="bg-[#217346] text-white px-6 py-3 rounded-md hover:bg-[#19603A] transition-colors duration-200 disabled:opacity-50 text-lg font-medium"
              disabled={isLoading || !query.trim()}
            >
              {isLoading ? (
                <span className="flex items-center">
                  <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
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
          
          <p className="text-neutral-500 text-sm mt-2">
            Examples: "How many cases has Smith handled?", "What are the outcomes for cases handled by Becker?", "Average award amount given by Johnson"
          </p>
        </div>
      </form>
      
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 p-4 rounded-md mt-6">
          {error}
        </div>
      )}
      
      {answer && !error && (
        <div className="bg-[#e8f4ee] border border-[#b8dbca] p-6 rounded-md mt-6">
          <h3 className="font-medium text-[#217346] text-lg mb-3">Answer:</h3>
          <div className="whitespace-pre-line text-neutral-700 text-lg">
            {answer}
          </div>
        </div>
      )}
      
      <div className="mt-8 bg-[#f7f7f7] p-4 rounded-md border border-neutral-200">
        <p className="font-medium text-neutral-700 mb-2">
          What you can ask:
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-1">
          <div className="bg-white p-3 rounded shadow-sm border border-neutral-100">
            <p className="font-medium text-[#217346]">Arbitrator case counts</p>
            <p className="text-sm text-neutral-600">How many cases has [name] handled?</p>
          </div>
          <div className="bg-white p-3 rounded shadow-sm border border-neutral-100">
            <p className="font-medium text-[#217346]">Arbitrator outcome analysis</p>
            <p className="text-sm text-neutral-600">What are the outcomes for cases handled by [name]?</p>
          </div>
          <div className="bg-white p-3 rounded shadow-sm border border-neutral-100">
            <p className="font-medium text-[#217346]">Arbitrator average awards</p>
            <p className="text-sm text-neutral-600">What is the average award amount given by [name]?</p>
          </div>
          <div className="bg-white p-3 rounded shadow-sm border border-neutral-100">
            <p className="font-medium text-[#217346]">Arbitrator case listing</p>
            <p className="text-sm text-neutral-600">List the cases handled by [name]</p>
          </div>
          <div className="md:col-span-2 bg-white p-3 rounded shadow-sm border border-neutral-100">
            <p className="font-medium text-[#217346]">Respondent outcome analysis</p>
            <p className="text-sm text-neutral-600">How many times has [arbitrator] ruled for the consumer against [company]?</p>
          </div>
        </div>
      </div>
    </div>
  );
}