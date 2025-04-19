import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface ArbitrationCase {
  id: number;
  caseId: string;
  forum: string;
  arbitratorName: string | null;
  claimantName: string | null;
  respondentName: string | null;
  consumerAttorney: string | null;
  filingDate: string | null;
  disposition: string | null;
  claimAmount: string | null;
  awardAmount: string | null;
  caseType: string | null;
  status: string;
  sourceFile: string;
  processingDate: string;
  hasDiscrepancies: boolean;
  duplicateOf: string | null;
}

interface PaginationData {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface FilterCriteria {
  arbitrator: string;
  respondent: string;
  caseType: string;
  disposition: string; 
  consumerAttorney: string;
  respondentAttorney: string;
  forum: string;
  dateFrom: string;
  dateTo: string;
}

interface DataTableProps {
  filter?: string;
  refreshTrigger: number;
  onSearch: (filter: string) => void;
}

export default function DataTable({ filter, refreshTrigger, onSearch }: DataTableProps) {
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(100);
  const [searchValue, setSearchValue] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [filterCriteria, setFilterCriteria] = useState<FilterCriteria>({
    arbitrator: "",
    respondent: "",
    caseType: "",
    disposition: "",
    consumerAttorney: "",
    respondentAttorney: "",
    forum: "",
    dateFrom: "",
    dateTo: ""
  });
  
  // Reset to page 1 when filter changes
  useEffect(() => {
    setPage(1);
  }, [filter]);
  
  // Fetch cases with pagination
  const { 
    data: response,
    isLoading,
    refetch 
  } = useQuery<{ 
    data: ArbitrationCase[], 
    pagination: PaginationData 
  }>({
    queryKey: ['/api/cases', page, rowsPerPage, filter],
    queryFn: async () => {
      // Create URL with query parameters
      const params = new URLSearchParams();
      params.append('page', page.toString());
      params.append('limit', rowsPerPage.toString());
      if (filter) {
        params.append('filter', filter);
      }
      const result = await fetch(`/api/cases?${params.toString()}`, {
        credentials: "include"
      });
      
      if (!result.ok) {
        const text = await result.text();
        throw new Error(`${result.status}: ${text || result.statusText}`);
      }
      
      return await result.json();
    }
  });
  
  // Refetch when refreshTrigger changes
  useEffect(() => {
    if (refreshTrigger > 0) {
      refetch();
    }
  }, [refreshTrigger, refetch]);
  
  const cases = response?.data || [];
  const pagination = response?.pagination || { page: 1, limit: rowsPerPage, total: 0, totalPages: 1 };
  
  // Handle pagination
  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= pagination.totalPages) {
      setPage(newPage);
    }
  };
  
  // Handle rows per page change
  const handleRowsPerPageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setRowsPerPage(parseInt(e.target.value));
    setPage(1); // Reset to first page when changing rows per page
  };
  
  // Handle search
  const handleSearch = () => {
    onSearch(searchValue);
  };
  
  const handleSearchKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };
  
  // Handle filter toggle
  const toggleFilters = () => {
    setShowFilters(!showFilters);
  };
  
  // Handle filter change
  const handleFilterChange = (field: keyof FilterCriteria, value: string) => {
    setFilterCriteria(prev => ({
      ...prev,
      [field]: value
    }));
  };
  
  // Apply filters
  const applyFilters = () => {
    // Build an advanced filter query
    const filterParts: string[] = [];
    
    if (filterCriteria.arbitrator) {
      filterParts.push(`arbitrator:${filterCriteria.arbitrator}`);
    }
    
    if (filterCriteria.respondent) {
      filterParts.push(`respondent:${filterCriteria.respondent}`);
    }
    
    if (filterCriteria.caseType) {
      filterParts.push(`caseType:${filterCriteria.caseType}`);
    }
    
    if (filterCriteria.disposition) {
      filterParts.push(`disposition:${filterCriteria.disposition}`);
    }
    
    if (filterCriteria.consumerAttorney) {
      filterParts.push(`attorney:${filterCriteria.consumerAttorney}`);
    }
    
    if (filterCriteria.forum) {
      filterParts.push(`forum:${filterCriteria.forum}`);
    }
    
    if (filterCriteria.dateFrom || filterCriteria.dateTo) {
      const dateFilter = `date:${filterCriteria.dateFrom || ''}:${filterCriteria.dateTo || ''}`;
      filterParts.push(dateFilter);
    }
    
    const advancedFilter = filterParts.join(' ');
    onSearch(advancedFilter);
  };
  
  // Clear filters
  const clearFilters = () => {
    setFilterCriteria({
      arbitrator: "",
      respondent: "",
      caseType: "",
      disposition: "",
      consumerAttorney: "",
      respondentAttorney: "",
      forum: "",
      dateFrom: "",
      dateTo: ""
    });
    onSearch("");
  };
  
  // Handle export
  const handleExport = async () => {
    try {
      // In a real implementation, this would call an API endpoint that
      // returns a file download, but for now we'll just show what data
      // would be included
      
      const params = new URLSearchParams();
      params.append('page', '1');
      params.append('limit', '10000'); // Get all data
      if (filter) {
        params.append('filter', filter);
      }
      
      const response = await fetch(`/api/cases?${params.toString()}`);
      const data = await response.json();
      
      // Convert data to CSV
      const headers = [
        'Case ID', 'Arbitrator Name', 'Respondent', 'Consumer Attorney',
        'Disposition', 'Claim Amount', 'Award Amount', 'Filing Date', 'Case Type', 'Forum'
      ];
      
      const rows = data.data.map((c: ArbitrationCase) => [
        c.caseId,
        c.arbitratorName || '',
        c.respondentName || '',
        c.consumerAttorney || '',
        c.disposition || '',
        c.claimAmount || '',
        c.awardAmount || '',
        c.filingDate ? new Date(c.filingDate).toLocaleDateString() : '',
        c.caseType || '',
        c.forum
      ]);
      
      const csvContent = [
        headers.join(','),
        ...rows.map((row: any) => row.join(','))
      ].join('\n');
      
      // Create a blob and download link
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', 'arbitration_cases.csv');
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Export failed:', error);
    }
  };
  
  // Format date for display
  const formatDate = (dateString: string | null) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return !isNaN(date.getTime()) 
      ? date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }) 
      : '';
  };
  
  // Format award amount for display
  const formatAmount = (amount: string | null) => {
    if (!amount) return 'N/A';
    
    // Try to extract just the number from the string and parse it
    const numericValue = parseFloat(amount.replace(/[^0-9.-]+/g, ""));
    
    if (isNaN(numericValue)) return amount;
    
    return numericValue === 0 
      ? '$0.00' 
      : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(numericValue);
  };
  
  // Standard CSS class for all rows
  const rowClass = 'hover:bg-neutral-50 border-b border-neutral-200';
  
  // Status display removed as requested
  
  // Generate pagination buttons
  const renderPaginationButtons = () => {
    const buttons = [];
    const maxButtonsToShow = 5;
    
    // Always show first page
    buttons.push(
      <button
        key="page-1"
        className={`w-6 h-6 flex items-center justify-center rounded text-[8pt] ${
          page === 1 ? 'bg-[#217346] text-white' : 'border border-neutral-200 text-neutral-500'
        }`}
        onClick={() => handlePageChange(1)}
      >
        1
      </button>
    );
    
    // Show ellipsis if needed
    if (page > 3) {
      buttons.push(
        <span key="ellipsis-start" className="text-neutral-300 text-[8pt]">...</span>
      );
    }
    
    // Show middle pages
    const startPage = Math.max(2, page - 1);
    const endPage = Math.min(pagination.totalPages - 1, page + 1);
    
    for (let i = startPage; i <= endPage; i++) {
      // Skip page 1 and last page (handled separately)
      if (i === 1 || i === pagination.totalPages) continue;
      
      buttons.push(
        <button
          key={`page-${i}`}
          className={`w-6 h-6 flex items-center justify-center rounded text-[8pt] ${
            page === i ? 'bg-[#217346] text-white' : 'border border-neutral-200 text-neutral-500'
          }`}
          onClick={() => handlePageChange(i)}
        >
          {i}
        </button>
      );
    }
    
    // Show ellipsis if needed
    if (page < pagination.totalPages - 2) {
      buttons.push(
        <span key="ellipsis-end" className="text-neutral-300 text-[8pt]">...</span>
      );
    }
    
    // Always show last page if there's more than one page
    if (pagination.totalPages > 1) {
      buttons.push(
        <button
          key={`page-${pagination.totalPages}`}
          className={`w-6 h-6 flex items-center justify-center rounded text-[8pt] ${
            page === pagination.totalPages ? 'bg-[#217346] text-white' : 'border border-neutral-200 text-neutral-500'
          }`}
          onClick={() => handlePageChange(pagination.totalPages)}
        >
          {pagination.totalPages}
        </button>
      );
    }
    
    return buttons;
  };
  
  return (
    <section className="bg-white rounded-md shadow-sm p-4 mb-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-[10pt] font-semibold text-neutral-500">Aggregated Arbitration Data</h2>
        
        {/* Controls */}
        <div className="flex items-center space-x-3">
          {/* Search Input */}
          <div className="relative">
            <input 
              type="text" 
              placeholder="Search..." 
              className="pl-8 pr-3 py-1 border border-[#b8dbca] rounded text-[8pt] w-48 focus:outline-none focus:border-[#217346] focus:ring-1 focus:ring-[#e8f4ee]"
              value={searchValue}
              onChange={e => setSearchValue(e.target.value)}
              onKeyPress={handleSearchKeyPress}
            />
            <div
              className="absolute left-1.5 top-1 size-5 rounded-full flex items-center justify-center hover:bg-[#e8f4ee] cursor-pointer transition-colors duration-200"
              onClick={handleSearch}
            >
              <svg 
                className="w-3 h-3 text-[#217346]" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24" 
                xmlns="http://www.w3.org/2000/svg"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
              </svg>
            </div>
          </div>
          
          {/* Filter Toggle Button */}
          <button 
            className={`flex items-center space-x-1 text-[8pt] ${showFilters ? 'bg-[#217346] text-white' : 'bg-[#e8f4ee] text-[#217346] border border-[#b8dbca]'} rounded px-3 py-1 hover:bg-[#19603A] hover:text-white transition-colors duration-200`}
            onClick={toggleFilters}
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"></path>
            </svg>
            <span>Filter</span>
          </button>
          
          {/* Export Button */}
          <button 
            className="flex items-center space-x-1 text-[8pt] bg-[#e8f4ee] text-[#217346] border border-[#b8dbca] rounded px-3 py-1 hover:bg-[#19603A] hover:text-white transition-colors duration-200"
            onClick={handleExport}
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
            </svg>
            <span>Export</span>
          </button>
        </div>
      </div>
      
      {/* Filter Panel */}
      {showFilters && (
        <div className="bg-[#f9fcfa] border border-[#e2f0e6] rounded-md p-3 mb-4 grid grid-cols-1 md:grid-cols-3 gap-3 text-[8pt]">
          <div>
            <label className="block text-neutral-500 mb-1">Arbitrator</label>
            <input
              type="text"
              className="w-full p-1 border border-[#b8dbca] rounded text-[8pt] focus:outline-none focus:border-[#217346] focus:ring-1 focus:ring-[#e8f4ee]"
              value={filterCriteria.arbitrator}
              onChange={(e) => handleFilterChange('arbitrator', e.target.value)}
              placeholder="Filter by arbitrator name"
            />
          </div>
          
          <div>
            <label className="block text-neutral-500 mb-1">Respondent</label>
            <input
              type="text"
              className="w-full p-1 border border-[#b8dbca] rounded text-[8pt] focus:outline-none focus:border-[#217346] focus:ring-1 focus:ring-[#e8f4ee]"
              value={filterCriteria.respondent}
              onChange={(e) => handleFilterChange('respondent', e.target.value)}
              placeholder="Filter by respondent name"
            />
          </div>
          
          <div>
            <label className="block text-neutral-500 mb-1">Case Type</label>
            <input
              type="text"
              className="w-full p-1 border border-[#b8dbca] rounded text-[8pt] focus:outline-none focus:border-[#217346] focus:ring-1 focus:ring-[#e8f4ee]"
              value={filterCriteria.caseType}
              onChange={(e) => handleFilterChange('caseType', e.target.value)}
              placeholder="Filter by case type"
            />
          </div>
          
          <div>
            <label className="block text-neutral-500 mb-1">Disposition</label>
            <input
              type="text"
              className="w-full p-1 border border-[#b8dbca] rounded text-[8pt] focus:outline-none focus:border-[#217346] focus:ring-1 focus:ring-[#e8f4ee]"
              value={filterCriteria.disposition}
              onChange={(e) => handleFilterChange('disposition', e.target.value)}
              placeholder="Filter by disposition"
            />
          </div>
          
          <div>
            <label className="block text-neutral-500 mb-1">Consumer Attorney</label>
            <input
              type="text"
              className="w-full p-1 border border-[#b8dbca] rounded text-[8pt] focus:outline-none focus:border-[#217346] focus:ring-1 focus:ring-[#e8f4ee]"
              value={filterCriteria.consumerAttorney}
              onChange={(e) => handleFilterChange('consumerAttorney', e.target.value)}
              placeholder="Filter by consumer attorney"
            />
          </div>
          
          <div>
            <label className="block text-neutral-500 mb-1">Forum</label>
            <select
              className="w-full p-1 border border-[#b8dbca] rounded text-[8pt] focus:outline-none focus:border-[#217346] focus:ring-1 focus:ring-[#e8f4ee] bg-white"
              value={filterCriteria.forum}
              onChange={(e) => handleFilterChange('forum', e.target.value)}
            >
              <option value="">All Forums</option>
              <option value="AAA">AAA</option>
              <option value="JAMS">JAMS</option>
            </select>
          </div>
          
          <div>
            <label className="block text-neutral-500 mb-1">Filing Date From</label>
            <input
              type="date"
              className="w-full p-1 border border-[#b8dbca] rounded text-[8pt] focus:outline-none focus:border-[#217346] focus:ring-1 focus:ring-[#e8f4ee]"
              value={filterCriteria.dateFrom}
              onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
            />
          </div>
          
          <div>
            <label className="block text-neutral-500 mb-1">Filing Date To</label>
            <input
              type="date"
              className="w-full p-1 border border-[#b8dbca] rounded text-[8pt] focus:outline-none focus:border-[#217346] focus:ring-1 focus:ring-[#e8f4ee]"
              value={filterCriteria.dateTo}
              onChange={(e) => handleFilterChange('dateTo', e.target.value)}
            />
          </div>
          
          <div className="flex items-end space-x-2">
            <button
              className="flex items-center px-3 py-1 bg-[#217346] text-white rounded text-[8pt] hover:bg-[#19603A] transition-colors duration-200"
              onClick={applyFilters}
            >
              <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
              </svg>
              Apply Filters
            </button>
            <button
              className="flex items-center px-3 py-1 bg-[#f5f5f5] text-neutral-600 border border-neutral-300 rounded text-[8pt] hover:bg-neutral-200 transition-colors duration-200"
              onClick={clearFilters}
            >
              <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
              Clear
            </button>
          </div>
        </div>
      )}
      
      {/* Table Container with horizontal scroll for mobile */}
      <div className="overflow-x-auto">
        <table className="data-table w-full border-collapse">
          <thead>
            <tr className="bg-[#d6e9d9]">
              <th className="p-2 text-left font-semibold text-[#11572e] border-b border-neutral-200">Case ID</th>
              <th className="p-2 text-left font-semibold text-[#11572e] border-b border-neutral-200">Arbitrator Name</th>
              <th className="p-2 text-left font-semibold text-[#11572e] border-b border-neutral-200">Respondent</th>
              <th className="p-2 text-left font-semibold text-[#11572e] border-b border-neutral-200">Consumer Attorney</th>
              <th className="p-2 text-left font-semibold text-[#11572e] border-b border-neutral-200">Disposition</th>
              <th className="p-2 text-right font-semibold text-[#11572e] border-b border-neutral-200">Claim Amount</th>
              <th className="p-2 text-right font-semibold text-[#11572e] border-b border-neutral-200">Award Amount</th>
              <th className="p-2 text-left font-semibold text-[#11572e] border-b border-neutral-200">Filing Date</th>
              <th className="p-2 text-left font-semibold text-[#11572e] border-b border-neutral-200">Case Type</th>
              <th className="p-2 text-left font-semibold text-[#11572e] border-b border-neutral-200">Forum</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={10} className="p-4 text-center text-neutral-400">Loading data...</td>
              </tr>
            ) : cases.length === 0 ? (
              <tr>
                <td colSpan={10} className="p-4 text-center text-neutral-400">
                  {filter ? "No matching records found" : "No data available. Upload Excel files to get started."}
                </td>
              </tr>
            ) : (
              cases.map((arbitrationCase: ArbitrationCase) => (
                <tr key={arbitrationCase.id} className={rowClass}>
                  <td className="p-2 text-neutral-500">{arbitrationCase.caseId}</td>
                  <td className="p-2 text-neutral-500">{arbitrationCase.arbitratorName || ''}</td>
                  <td className="p-2 text-neutral-500">{arbitrationCase.respondentName || ''}</td>
                  <td className="p-2 text-neutral-500" title={arbitrationCase.consumerAttorney || ''}>
                    {arbitrationCase.consumerAttorney ? 
                      (arbitrationCase.consumerAttorney.length > 30 
                        ? `${arbitrationCase.consumerAttorney.substring(0, 30)}...` 
                        : arbitrationCase.consumerAttorney) 
                      : ''
                    }
                  </td>
                  <td className="p-2 text-neutral-500">{arbitrationCase.disposition || ''}</td>
                  <td className="p-2 text-neutral-500 text-right">{formatAmount(arbitrationCase.claimAmount)}</td>
                  <td className="p-2 text-neutral-500 text-right">{formatAmount(arbitrationCase.awardAmount)}</td>
                  <td className="p-2 text-neutral-500">{formatDate(arbitrationCase.filingDate)}</td>
                  <td className="p-2 text-neutral-500">{arbitrationCase.caseType || 'N/A'}</td>
                  <td className="p-2 text-neutral-500">{arbitrationCase.forum}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      
      {/* Pagination Controls */}
      <div className="flex justify-between items-center mt-4">
        <div className="text-[8pt] text-neutral-400">
          {pagination.total > 0 ? (
            `Showing ${(page - 1) * rowsPerPage + 1}-${
              Math.min(page * rowsPerPage, pagination.total)
            } of ${pagination.total} entries`
          ) : (
            "No entries to display"
          )}
        </div>
        
        <div className="flex items-center space-x-1">
          <button 
            className="p-1 rounded border border-[#b8dbca] text-[#217346] bg-[#e8f4ee] hover:bg-[#19603A] hover:text-white transition-colors duration-200 disabled:opacity-50 disabled:hover:bg-[#e8f4ee] disabled:hover:text-[#217346]"
            onClick={() => handlePageChange(page - 1)}
            disabled={page === 1}
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7"></path>
            </svg>
          </button>
          
          {renderPaginationButtons()}
          
          <button 
            className="p-1 rounded border border-[#b8dbca] text-[#217346] bg-[#e8f4ee] hover:bg-[#19603A] hover:text-white transition-colors duration-200 disabled:opacity-50 disabled:hover:bg-[#e8f4ee] disabled:hover:text-[#217346]"
            onClick={() => handlePageChange(page + 1)}
            disabled={page === pagination.totalPages}
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path>
            </svg>
          </button>
        </div>
        
        <div className="text-[8pt] text-neutral-400 flex items-center">
          <span className="mr-2">Rows per page:</span>
          <select 
            className="border border-[#b8dbca] rounded p-1 text-[8pt] focus:outline-none focus:border-[#217346] focus:ring-1 focus:ring-[#e8f4ee] bg-white"
            value={rowsPerPage}
            onChange={handleRowsPerPageChange}
          >
            <option value="50">50</option>
            <option value="100">100</option>
            <option value="250">250</option>
          </select>
        </div>
      </div>
    </section>
  );
}
