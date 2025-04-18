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

interface DataTableProps {
  filter?: string;
  refreshTrigger: number;
  onSearch: (filter: string) => void;
}

export default function DataTable({ filter, refreshTrigger, onSearch }: DataTableProps) {
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(100);
  const [searchValue, setSearchValue] = useState("");
  
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
        'Disposition', 'Claim Amount', 'Award Amount', 'Filing Date', 'Forum'
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
              className="pl-8 pr-3 py-1 border border-neutral-200 rounded text-[8pt] w-48 focus:outline-none focus:border-primary"
              value={searchValue}
              onChange={e => setSearchValue(e.target.value)}
              onKeyPress={handleSearchKeyPress}
            />
            <svg 
              className="w-3 h-3 text-neutral-300 absolute left-2.5 top-1.5" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24" 
              xmlns="http://www.w3.org/2000/svg"
              onClick={handleSearch}
              style={{ cursor: 'pointer' }}
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
            </svg>
          </div>
          
          {/* Export Button */}
          <button 
            className="flex items-center space-x-1 text-[8pt] text-neutral-500 border border-neutral-200 rounded px-3 py-1"
            onClick={handleExport}
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
            </svg>
            <span>Export</span>
          </button>
        </div>
      </div>
      
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
                  <td className="p-2 text-neutral-500">{arbitrationCase.consumerAttorney || ''}</td>
                  <td className="p-2 text-neutral-500">{arbitrationCase.disposition || ''}</td>
                  <td className="p-2 text-neutral-500 text-right">{formatAmount(arbitrationCase.claimAmount)}</td>
                  <td className="p-2 text-neutral-500 text-right">{formatAmount(arbitrationCase.awardAmount)}</td>
                  <td className="p-2 text-neutral-500">{formatDate(arbitrationCase.filingDate)}</td>
                  <td className="p-2 text-neutral-500">{arbitrationCase.caseType || ''}</td>
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
            className="p-1 rounded border border-neutral-200 text-neutral-400 disabled:opacity-50"
            onClick={() => handlePageChange(page - 1)}
            disabled={page === 1}
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7"></path>
            </svg>
          </button>
          
          {renderPaginationButtons()}
          
          <button 
            className="p-1 rounded border border-neutral-200 text-neutral-500 disabled:opacity-50"
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
            className="border border-neutral-200 rounded p-1 text-[8pt]"
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
