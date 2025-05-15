import { useState } from "react";

interface NlpQueryPanelProps {
  className?: string;
}

export default function NlpQueryPanel({ className = "" }: NlpQueryPanelProps) {
  const [query, setQuery] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);

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

  const examples = [
    { type: "Count", query: "How many cases has Smith handled?" },
    { type: "Outcomes", query: "What are the outcomes for cases handled by Smith?" },
    { type: "Awards", query: "What is the average award amount given by Smith?" },
    { type: "Listing", query: "List the cases handled by Smith" },
    { type: "Company", query: "What are the outcomes for Bank of America as respondent?" },
  ];

  const setExampleQuery = (exampleQuery: string) => {
    setQuery(exampleQuery);
    // Focus on the input after setting the example
    const input = document.getElementById("nlp-query");
    if (input) {
      input.focus();
    }
  };

  return (
    <div className={`bg-white rounded-lg shadow-md p-4 ${className}`}>
      <div className="mb-4">
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-lg font-semibold text-[#217346]">Natural Language Query</h2>
          <button
            type="button"
            className="text-sm text-[#14863e] hover:underline flex items-center"
            onClick={() => setShowHelp(!showHelp)}
          >
            {showHelp ? 'Hide Help' : 'Show Help'}
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 ml-1" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
        
        {showHelp && (
          <div className="bg-[#e8f4ee] border border-[#b8dbca] p-3 rounded-md mb-4 text-sm">
            <h3 className="font-medium text-[#217346] mb-2">How to Ask Questions</h3>
            <p className="mb-2">
              You can ask natural language questions about arbitration cases in the database. For best results:
            </p>
            <ul className="list-disc pl-5 mb-3 space-y-1 text-neutral-700">
              <li>Include a specific name (arbitrator or company)</li>
              <li>Be clear about what information you want (count, outcomes, awards, etc.)</li>
              <li>For common last names (like "Smith"), consider using full names</li>
            </ul>
            <p className="text-neutral-600 mb-3">
              The system will provide multiple matches if your query is ambiguous.
            </p>
          </div>
        )}
      </div>
      
      <form onSubmit={handleSubmit} className="mb-4">
        <div className="flex flex-col space-y-2">
          <label htmlFor="nlp-query" className="text-sm font-medium text-neutral-700">
            Ask a question about arbitration cases
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
        </div>
      </form>
      
      <div className="mb-4">
        <p className="text-sm font-medium text-neutral-700 mb-2">Try one of these examples:</p>
        <div className="flex flex-wrap gap-2">
          {examples.map((example, index) => (
            <button
              key={index}
              className="text-xs bg-[#e8f4ee] hover:bg-[#d0e9db] text-[#217346] py-1 px-2 rounded border border-[#b8dbca] transition-colors duration-150"
              onClick={() => setExampleQuery(example.query)}
            >
              {example.query}
            </button>
          ))}
        </div>
      </div>
      
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded mt-4">
          {error}
        </div>
      )}
      
      {answer && !error && (
        <div className="bg-[#e8f4ee] border border-[#b8dbca] p-4 rounded mt-4">
          <div className="mb-2">
            <h3 className="font-medium text-[#217346]">Answer:</h3>
          </div>
          <div className="whitespace-pre-line text-neutral-700">
            {answer}
          </div>
        </div>
      )}
      
      <div className="mt-6 pt-4 border-t border-gray-200">
        <p className="text-sm font-medium text-neutral-700 mb-2">
          Types of questions you can ask:
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="bg-gray-50 p-2 rounded">
            <p className="font-medium text-sm text-neutral-700">Case Counts</p>
            <p className="text-xs text-neutral-600">"How many cases has [arbitrator] handled?"</p>
          </div>
          <div className="bg-gray-50 p-2 rounded">
            <p className="font-medium text-sm text-neutral-700">Outcome Analysis</p>
            <p className="text-xs text-neutral-600">"What are the outcomes for cases handled by [arbitrator]?"</p>
          </div>
          <div className="bg-gray-50 p-2 rounded">
            <p className="font-medium text-sm text-neutral-700">Award Amounts</p>
            <p className="text-xs text-neutral-600">"What is the average award amount given by [arbitrator]?"</p>
          </div>
          <div className="bg-gray-50 p-2 rounded">
            <p className="font-medium text-sm text-neutral-700">Case Listings</p>
            <p className="text-xs text-neutral-600">"List the cases handled by [arbitrator]"</p>
          </div>
          <div className="bg-gray-50 p-2 rounded">
            <p className="font-medium text-sm text-neutral-700">Respondent Analysis</p>
            <p className="text-xs text-neutral-600">"What are the outcomes for [company] as respondent?"</p>
          </div>
        </div>
      </div>
    </div>
  );
}