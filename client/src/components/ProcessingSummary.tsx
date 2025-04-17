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
    enabled: !summary
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
  
  // Determine data quality label
  const getDataQualityLabel = () => {
    if (data.totalCases === 0) return "N/A";
    
    const duplicateRate = (data.duplicates / data.totalCases) * 100;
    const missingDataRate = (data.missingData / data.totalCases) * 100;
    
    if (duplicateRate < 2 && missingDataRate < 5) return "Good";
    if (duplicateRate < 5 && missingDataRate < 10) return "Fair";
    return "Needs Review";
  };
  
  // Determine data quality class
  const getDataQualityClass = () => {
    if (data.totalCases === 0) return "text-neutral-400";
    
    const quality = getDataQualityLabel();
    if (quality === "Good") return "text-success";
    if (quality === "Fair") return "text-warning";
    return "text-error";
  };
  
  return (
    <section className="mt-6 bg-white rounded-md shadow-sm p-4">
      <h2 className="text-[10pt] font-semibold text-neutral-500 mb-3">Data Processing Summary</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Statistics Card: Total Cases */}
        <div className="bg-neutral-50 rounded p-3">
          <div className="flex justify-between items-center">
            <h3 className="text-[9pt] text-neutral-400">Total Cases</h3>
            <span className="text-[10pt] font-semibold text-neutral-500">{data.totalCases}</span>
          </div>
          <div className="flex mt-2">
            <div className="flex-1">
              <div className="text-[8pt] text-neutral-400">AAA</div>
              <div className="text-[9pt] font-medium text-primary">{data.aaa}</div>
            </div>
            <div className="flex-1">
              <div className="text-[8pt] text-neutral-400">JAMS</div>
              <div className="text-[9pt] font-medium text-secondary">{data.jams}</div>
            </div>
          </div>
        </div>
        
        {/* Statistics Card: Data Quality */}
        <div className="bg-neutral-50 rounded p-3">
          <div className="flex justify-between items-center">
            <h3 className="text-[9pt] text-neutral-400">Data Quality</h3>
            <span className={`text-[10pt] font-semibold ${getDataQualityClass()}`}>
              {getDataQualityLabel()}
            </span>
          </div>
          <div className="flex mt-2">
            <div className="flex-1">
              <div className="text-[8pt] text-neutral-400">Duplicates</div>
              <div className="text-[9pt] font-medium text-warning">{data.duplicates}</div>
            </div>
            <div className="flex-1">
              <div className="text-[8pt] text-neutral-400">Missing Data</div>
              <div className="text-[9pt] font-medium text-neutral-400">{data.missingData}</div>
            </div>
          </div>
        </div>
        
        {/* Statistics Card: Award Amounts */}
        <div className="bg-neutral-50 rounded p-3">
          <div className="flex justify-between items-center">
            <h3 className="text-[9pt] text-neutral-400">Award Statistics</h3>
            <span className="text-[10pt] font-semibold text-neutral-500">
              {formatCurrency(data.totalAwardAmount)} Total
            </span>
          </div>
          <div className="flex mt-2">
            <div className="flex-1">
              <div className="text-[8pt] text-neutral-400">Average</div>
              <div className="text-[9pt] font-medium text-neutral-500">
                {formatCurrency(data.averageAwardAmount)}
              </div>
            </div>
            <div className="flex-1">
              <div className="text-[8pt] text-neutral-400">Highest</div>
              <div className="text-[9pt] font-medium text-neutral-500">
                {formatCurrency(data.highestAwardAmount)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
