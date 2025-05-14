import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  Cell, Label, LabelList 
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest } from "../lib/queryClient";

interface ArbitratorRanking {
  arbitratorName: string;
  caseCount: number;
}

interface ArbitratorAwardRanking {
  arbitratorName: string;
  caseCount: number;
  averageAward: number;
  totalAwards: number;
  maxAward: number;
}

interface CaseType {
  caseType: string;
  count: number;
}

export default function ArbitratorVisualizations() {
  const [selectedCaseType, setSelectedCaseType] = useState<string>("all");
  const [caseTypes, setCaseTypes] = useState<CaseType[]>([]);
  
  // Fetch case types
  const { data: caseTypeData } = useQuery<CaseType[]>({
    queryKey: ['/api/case-types'],
  });
  
  // Update case types when data is received
  useEffect(() => {
    if (caseTypeData && Array.isArray(caseTypeData)) {
      setCaseTypes(caseTypeData);
    }
  }, [caseTypeData]);
  
  // Fetch arbitrator rankings by case count
  const casesUrl = `/api/arbitrator-rankings/cases${selectedCaseType !== 'all' ? `?caseType=${encodeURIComponent(selectedCaseType)}` : ''}`;
  const { data: rankingsByCases, isLoading: isLoadingRankings } = useQuery({
    queryKey: [casesUrl, selectedCaseType],
    queryFn: () => apiRequest<ArbitratorRanking[]>(casesUrl),
  });
  
  // Fetch arbitrator rankings by award amounts
  const awardsUrl = `/api/arbitrator-rankings/awards${selectedCaseType !== 'all' ? `?caseType=${encodeURIComponent(selectedCaseType)}` : ''}`;
  const { data: rankingsByAwards, isLoading: isLoadingAwards } = useQuery({
    queryKey: [awardsUrl, selectedCaseType],
    queryFn: () => apiRequest<ArbitratorAwardRanking[]>(awardsUrl),
  });
  
  // Colors for charts
  const barColors = ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf'];
  
  // Format award amounts
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };
  
  // Format arbitrator name (keep it short for display)
  const formatArbitratorName = (name: string) => {
    if (!name) return "";
    
    // Split the name and get the last part (likely the last name)
    const parts = name.split(' ');
    if (parts.length <= 2) return name;
    
    // For longer names, show first initial + last name
    return `${parts[0][0]}. ${parts[parts.length - 1]}`;
  };
  
  // Prepare data for display - make sure we filter out nulls and NA values as requested
  const caseRankingData = Array.isArray(rankingsByCases) 
    ? rankingsByCases
        .filter((item) => 
          item.arbitratorName && 
          item.caseCount && 
          item.arbitratorName !== 'NA' && 
          item.arbitratorName.toUpperCase() !== 'NA' && 
          item.arbitratorName !== 'N/A' && 
          item.arbitratorName !== 'Not Available'
        )
        .map((item, index) => ({
          ...item,
          arbitratorDisplayName: formatArbitratorName(item.arbitratorName),
          color: barColors[index % barColors.length]
        }))
    : [];
    
  const awardRankingData = Array.isArray(rankingsByAwards) 
    ? rankingsByAwards
        .filter((item) => 
          item.arbitratorName && 
          item.averageAward && 
          !isNaN(Number(item.averageAward)) &&
          item.arbitratorName !== 'NA' && 
          item.arbitratorName.toUpperCase() !== 'NA' && 
          item.arbitratorName !== 'N/A' && 
          item.arbitratorName !== 'Not Available'
        )
        .map((item, index) => ({
          ...item,
          arbitratorDisplayName: formatArbitratorName(item.arbitratorName),
          color: barColors[index % barColors.length],
          formattedAverage: formatCurrency(Number(item.averageAward))
        }))
    : [];
    
  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Arbitrator Rankings</h2>
          <p className="text-muted-foreground">
            Visual comparison of arbitrator performance metrics
          </p>
        </div>
        
        <div className="w-full md:w-64">
          <Select
            value={selectedCaseType}
            onValueChange={(value) => setSelectedCaseType(value)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Filter by case type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All case types</SelectItem>
              {caseTypes.map((type) => (
                <SelectItem key={type.caseType} value={type.caseType || "unknown"}>
                  {type.caseType || "Unknown"} ({type.count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Case Count Rankings */}
        <Card>
          <CardHeader>
            <CardTitle>Most Awarded Cases by Arbitrator</CardTitle>
            <CardDescription>
              Arbitrators ranked by number of awarded cases handled
              {selectedCaseType && ` (${selectedCaseType} cases)`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingRankings ? (
              <div className="h-80 flex items-center justify-center">
                <p>Loading data...</p>
              </div>
            ) : caseRankingData.length > 0 ? (
              <ResponsiveContainer width="100%" height={400}>
                <BarChart
                  data={caseRankingData}
                  margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
                  layout="vertical"
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis 
                    dataKey="arbitratorDisplayName" 
                    type="category" 
                    width={100}
                    tick={{ fontSize: 12 }}
                  />
                  <Tooltip 
                    formatter={(value, name) => [value, 'Case Count']}
                    labelFormatter={(value) => {
                      const item = caseRankingData.find(d => d.arbitratorDisplayName === value);
                      return item ? item.arbitratorName : value;
                    }}
                  />
                  <Bar dataKey="caseCount" name="Case Count">
                    {caseRankingData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                    <LabelList dataKey="caseCount" position="right" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-80 flex items-center justify-center">
                <p>No data available</p>
              </div>
            )}
          </CardContent>
        </Card>
        
        {/* Award Amount Rankings */}
        <Card>
          <CardHeader>
            <CardTitle>Most Awarded Cases by Amount</CardTitle>
            <CardDescription>
              Arbitrators ranked by average award amount in awarded cases
              {selectedCaseType && ` (${selectedCaseType} cases)`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingAwards ? (
              <div className="h-80 flex items-center justify-center">
                <p>Loading data...</p>
              </div>
            ) : awardRankingData.length > 0 ? (
              <ResponsiveContainer width="100%" height={400}>
                <BarChart
                  data={awardRankingData}
                  margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
                  layout="vertical"
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    type="number" 
                    tickFormatter={(value) => formatCurrency(value)}
                  />
                  <YAxis 
                    dataKey="arbitratorDisplayName" 
                    type="category" 
                    width={100}
                    tick={{ fontSize: 12 }}
                  />
                  <Tooltip 
                    formatter={(value, name) => {
                      if (name === "Average Award") {
                        return [formatCurrency(Number(value)), name];
                      }
                      return [value, name];
                    }}
                    labelFormatter={(value) => {
                      const item = awardRankingData.find(d => d.arbitratorDisplayName === value);
                      return item ? item.arbitratorName : value;
                    }}
                  />
                  <Bar dataKey="averageAward" name="Average Award">
                    {awardRankingData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                    <LabelList 
                      dataKey="formattedAverage" 
                      position="right" 
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-80 flex items-center justify-center">
                <p>No data available</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}