import React, { useState, useEffect } from "react";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";

interface AutoSuggestFilterProps {
  type: "arbitrator" | "respondent" | "caseType" | "disposition" | "attorney";
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
}

export default function AutoSuggestFilter({
  type,
  value,
  onChange,
  label,
  placeholder
}: AutoSuggestFilterProps) {
  // Map filter type to API endpoint
  const endpointMap = {
    arbitrator: '/api/suggestions/arbitrators',
    respondent: '/api/suggestions/respondents',
    caseType: '/api/suggestions/case-types',
    disposition: '/api/suggestions/dispositions',
    attorney: '/api/suggestions/attorneys'
  };
  
  const endpoint = endpointMap[type];
  const [options, setOptions] = useState<ComboboxOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Fetch options from API
  useEffect(() => {
    const fetchOptions = async () => {
      try {
        setIsLoading(true);
        const response = await fetch(endpoint);
        
        if (!response.ok) {
          throw new Error(`Failed to fetch ${type} suggestions`);
        }
        
        const data = await response.json();
        
        if (Array.isArray(data)) {
          const formattedOptions = data.map((item: string) => ({
            value: item,
            label: item
          }));
          setOptions(formattedOptions);
        }
      } catch (error) {
        console.error(`Error fetching ${type} options:`, error);
        setOptions([]);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchOptions();
  }, [endpoint, type]);
  
  return (
    <div>
      <label className="block text-neutral-500 mb-1">{label}</label>
      {isLoading ? (
        <div className="w-full p-1 h-7 border border-neutral-200 rounded text-[8pt] bg-neutral-50">
          Loading...
        </div>
      ) : (
        <Combobox
          options={options}
          value={value}
          onChange={onChange}
          placeholder={placeholder || `Select ${label.toLowerCase()}`}
          triggerClassName="border-neutral-200 text-neutral-700 focus:border-primary"
        />
      )}
    </div>
  );
}