#!/bin/bash

# Define the fields to update
fields=("respondentName" "consumerAttorney" "disposition" "claimAmount" "awardAmount" "filingDate" "caseType" "forum")

for field in "${fields[@]}"; do
  # Find the SVG code block
  old_code=$(grep -A 5 "className={\`w-4 h-3 \${sortField === '$field' && sortOrder === 'asc'" client/src/components/DataTable.tsx -B 1 | head -n 6)
  
  # Create the new code with clickable divs
  new_code="                  <div className=\"flex flex-col\">
                    <div onClick={(e) => {
                        e.stopPropagation();
                        setSortField('$field');
                        setSortOrder('asc');
                        setPage(1);
                      }} 
                      className=\"cursor-pointer\"
                    >
                      <svg className={\`w-4 h-3 \${sortField === '$field' && sortOrder === 'asc' ? 'text-[#11572e]' : 'text-[#97ba9e]'}\`} viewBox=\"0 0 24 24\" fill=\"currentColor\">
                        <path d=\"M7 14l5-5 5 5H7z\"/>
                      </svg>
                    </div>
                    <div onClick={(e) => {
                        e.stopPropagation();
                        setSortField('$field');
                        setSortOrder('desc');
                        setPage(1);
                      }}
                      className=\"cursor-pointer\"
                    >
                      <svg className={\`w-4 h-3 \${sortField === '$field' && sortOrder === 'desc' ? 'text-[#11572e]' : 'text-[#97ba9e]'}\`} viewBox=\"0 0 24 24\" fill=\"currentColor\">
                        <path d=\"M7 10l5 5 5-5H7z\"/>
                      </svg>
                    </div>
                  </div>"
  
  # Replace the old code with the new code
  sed -i "s|$old_code|$new_code|g" client/src/components/DataTable.tsx
done

echo "Update completed."
