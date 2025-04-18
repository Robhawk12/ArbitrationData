import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";

interface DataSummary {
  totalCases: number;
  aaa: number;
  jams: number;
  duplicates: number;
  missingData: number;
  totalAwardAmount: number;
  averageAwardAmount: number;
  highestAwardAmount: number;
}

interface ProcessingSummaryProps {
  summary?: DataSummary;
  refreshTrigger: number;
}

export default function ProcessingSummary({ summary, refreshTrigger }: ProcessingSummaryProps) {
  // Fetch summary data if not provided
  const { data: fetchedSummary, refetch } = useQuery<DataSummary>({
    queryKey: ['/api/summary'],
    enabled: !summary,
  });
  
  // Refetch when refreshTrigger changes
  useEffect(() => {
    if (refreshTrigger > 0) {
      refetch();
    }
  }, [refreshTrigger, refetch]);
  
  const data = summary || fetchedSummary || {
    totalCases: 0,
    aaa: 0,
    jams: 0,
    duplicates: 0,
    missingData: 0,
    totalAwardAmount: 0,
    averageAwardAmount: 0,
    highestAwardAmount: 0
  };
  
  // Format currency values
  const formatCurrency = (amount: number) => {
    // Format for millions
    if (amount >= 1000000) {
      return `$${(amount / 1000000).toFixed(1)}M`;
    }
    // Format for thousands
    if (amount >= 1000) {
      return `$${(amount / 1000).toFixed(0)}K`;
    }
    // Regular formatting
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };
  
  return (
    <section className="mt-6 bg-white rounded-md shadow-sm p-4">
      <h2 className="text-[10pt] font-semibold text-neutral-500 mb-3">Data Processing Summary</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Statistics Card: Total Cases */}
        <div className="bg-[#eaf4eb] rounded p-3 border border-[#c6e6c8]">
          <div className="flex justify-between items-center">
            <h3 className="text-[9pt] text-[#11572e]">Total Cases</h3>
            <span className="text-[10pt] font-semibold text-[#217346]">{data.totalCases}</span>
          </div>
          <div className="flex mt-2">
            <div className="flex-1">
              <div className="text-[8pt] text-[#538d59]">AAA</div>
              <div className="text-[9pt] font-medium text-[#217346]">{data.aaa}</div>
            </div>
            <div className="flex-1">
              <div className="text-[8pt] text-[#538d59]">JAMS</div>
              <div className="text-[9pt] font-medium text-[#217346]">{data.jams}</div>
            </div>
          </div>
        </div>
        
        {/* Statistics Card: Award Amounts */}
        <div className="bg-[#eaf4eb] rounded p-3 border border-[#c6e6c8]">
          <div className="flex justify-between items-center">
            <h3 className="text-[9pt] text-[#11572e]">Award Statistics</h3>
            <span className="text-[10pt] font-semibold text-[#217346]">
              {formatCurrency(data.totalAwardAmount)} Total
            </span>
          </div>
          <div className="flex mt-2">
            <div className="flex-1">
              <div className="text-[8pt] text-[#538d59]">Average</div>
              <div className="text-[9pt] font-medium text-[#217346]">
                {formatCurrency(data.averageAwardAmount)}
              </div>
            </div>
            <div className="flex-1">
              <div className="text-[8pt] text-[#538d59] font-medium">Highest</div>
              <div className="text-[9pt] font-semibold text-[#217346]">
                {formatCurrency(data.highestAwardAmount)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}