import React from "react";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

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
  
  // Fetch options from API
  const { data, isLoading } = useQuery({
    queryKey: [endpoint],
    queryFn: async () => {
      const response = await fetch(endpoint);
      if (!response.ok) {
        throw new Error('Failed to fetch suggestions');
      }
      return response.json() as Promise<string[]>;
    }
  });
  
  // Convert string[] to ComboboxOption[]
  const options: ComboboxOption[] = React.useMemo(() => {
    if (!data || !Array.isArray(data)) return [];
    return data.map((item: string) => ({
      value: item,
      label: item
    }));
  }, [data]);
  
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