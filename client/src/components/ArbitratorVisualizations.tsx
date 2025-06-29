import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  Cell, Label, LabelList 
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
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
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  
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
  
  // Helper function to build query params
  const buildQueryParams = () => {
    const params = new URLSearchParams();
    
    if (selectedCaseType !== 'all') {
      params.append('caseType', selectedCaseType);
    }
    
    if (startDate) {
      params.append('dateFrom', startDate.toISOString().split('T')[0]);
    }
    
    if (endDate) {
      params.append('dateTo', endDate.toISOString().split('T')[0]);
    }
    
    const queryString = params.toString();
    return queryString ? `?${queryString}` : '';
  };
  
  // Fetch arbitrator rankings by case count
  const casesUrl = `/api/arbitrator-rankings/cases${buildQueryParams()}`;
  const { 
    data: rankingsByCases, 
    isLoading: isLoadingRankings,
    error: rankingsError
  } = useQuery({
    queryKey: ['/api/arbitrator-rankings/cases', selectedCaseType, startDate, endDate],
    queryFn: () => apiRequest<ArbitratorRanking[]>(casesUrl),
    retry: 3,
    retryDelay: 1000,
  });
  
  // Fetch arbitrator rankings by award amounts
  const awardsUrl = `/api/arbitrator-rankings/awards${buildQueryParams()}`;
  const { 
    data: rankingsByAwards, 
    isLoading: isLoadingAwards,
    error: awardsError
  } = useQuery({
    queryKey: ['/api/arbitrator-rankings/awards', selectedCaseType, startDate, endDate],
    queryFn: () => apiRequest<ArbitratorAwardRanking[]>(awardsUrl),
    retry: 3,
    retryDelay: 1000,
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
  
  // Format arbitrator name (first initial, middle initial if available, last name, no Esq.)
  const formatArbitratorName = (name: string) => {
    if (!name) return "";
    
    // Remove common suffixes and prefixes
    const cleanName = name
      // Remove suffix Esq
      .replace(/,?\s+Esq\.?$/i, '')
      // Remove suffix Jr, Sr, I, II, III, IV, etc.
      .replace(/,?\s+(Jr\.?|Sr\.?|I{1,3}|IV|V)$/i, '')
      // Remove prefixes like Hon., Dr., Judge, Justice, etc.
      .replace(/^(Hon\.|Dr\.|Judge|Justice|Mr\.|Mrs\.|Ms\.|Prof\.)\s+/i, '')
      .trim();
    
    // Split the name into parts
    const parts = cleanName.split(' ').filter(part => part && part.trim() !== '');
    
    // Handle simple cases
    if (parts.length === 0) return name;
    if (parts.length === 1) return cleanName;
    
    // Get the last name (last part)
    const lastName = parts[parts.length - 1];
    
    // Get first initial - check if already just an initial like "J."
    const firstPart = parts[0];
    const firstInitial = firstPart.length === 1 || (firstPart.length === 2 && firstPart.endsWith('.')) 
      ? firstPart
      : firstPart[0] + '.';
    
    // Process remaining parts for middle initial(s)
    if (parts.length >= 3) {
      // Get middle part to use as middle initial
      const middlePart = parts[1];
      // Check if middle part is already an initial
      const middleInitial = middlePart.length === 1 || (middlePart.length === 2 && middlePart.endsWith('.'))
        ? middlePart
        : middlePart[0] + '.';
      
      return `${firstInitial} ${middleInitial} ${lastName}`;
    }
    
    // Just first initial and last name
    return `${firstInitial} ${lastName}`;
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
        
        <div className="flex flex-col md:flex-row items-end gap-4 w-full md:w-auto">
          {/* Date Range Filter */}
          <div className="flex flex-row gap-2 w-full md:w-auto">
            {/* Start Date */}
            <div className="grid gap-2 w-full">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !startDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {startDate ? format(startDate, "MM/dd/yyyy") : "Start Date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={startDate}
                    onSelect={setStartDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            
            {/* End Date */}
            <div className="grid gap-2 w-full">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !endDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {endDate ? format(endDate, "MM/dd/yyyy") : "End Date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={endDate}
                    onSelect={setEndDate}
                    initialFocus
                    disabled={(date) => startDate ? date < startDate : false}
                  />
                </PopoverContent>
              </Popover>
            </div>
            
            {/* Clear Dates Button - Only show if either date is set */}
            {(startDate || endDate) && (
              <Button 
                variant="ghost" 
                size="icon"
                onClick={() => {
                  setStartDate(undefined);
                  setEndDate(undefined);
                }}
                className="h-10 w-10 shrink-0"
              >
                ✕
              </Button>
            )}
          </div>
          
          {/* Case Type Filter */}
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
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Case Count Rankings */}
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Most Awarded Cases by Arbitrator</CardTitle>
            <CardDescription>
              Arbitrators ranked by number of awarded cases handled
              {selectedCaseType !== 'all' && ` (${selectedCaseType} cases)`}
              {(startDate || endDate) && (
                <span className="block mt-1 text-xs italic">
                  {startDate && `From: ${format(startDate, "MM/dd/yyyy")}`}
                  {startDate && endDate && ' — '}
                  {endDate && `To: ${format(endDate, "MM/dd/yyyy")}`}
                </span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingRankings ? (
              <div className="h-80 flex items-center justify-center">
                <p>Loading data...</p>
              </div>
            ) : rankingsError ? (
              <div className="h-80 flex items-center justify-center flex-col gap-2">
                <p className="text-destructive">Error loading data</p>
                <p className="text-muted-foreground text-sm">{String(rankingsError)}</p>
                <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
                  Retry
                </Button>
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
                <p>No data available for the selected filters</p>
              </div>
            )}
          </CardContent>
        </Card>
        
        {/* Award Amount Rankings */}
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Most Awarded Cases by Amount</CardTitle>
            <CardDescription>
              Arbitrators ranked by average award amount in awarded cases
              {selectedCaseType !== 'all' && ` (${selectedCaseType} cases)`}
              {(startDate || endDate) && (
                <span className="block mt-1 text-xs italic">
                  {startDate && `From: ${format(startDate, "MM/dd/yyyy")}`}
                  {startDate && endDate && ' — '}
                  {endDate && `To: ${format(endDate, "MM/dd/yyyy")}`}
                </span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingAwards ? (
              <div className="h-80 flex items-center justify-center">
                <p>Loading data...</p>
              </div>
            ) : awardsError ? (
              <div className="h-80 flex items-center justify-center flex-col gap-2">
                <p className="text-destructive">Error loading data</p>
                <p className="text-muted-foreground text-sm">{String(awardsError)}</p>
                <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
                  Retry
                </Button>
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
                <p>No data available for the selected filters</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}