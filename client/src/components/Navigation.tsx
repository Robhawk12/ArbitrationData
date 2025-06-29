import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

interface NavigationProps {
  children: React.ReactNode;
}

export default function Navigation({ children }: NavigationProps) {
  const [activeTab, setActiveTab] = useState("query");

  return (
    <Tabs
      defaultValue="query"
      className="w-full"
      value={activeTab}
      onValueChange={setActiveTab}
    >
      <div className="border-b">
        <TabsList className="h-14 px-4 py-0 bg-transparent">
          <TabsTrigger
            value="query"
            className="text-lg px-5 py-3 data-[state=active]:bg-[#e8f4ee] data-[state=active]:text-[#217346] data-[state=active]:border-b-2 data-[state=active]:border-[#217346]"
          >
            Query Arbitration Data
          </TabsTrigger>
          <TabsTrigger
            value="visualization"
            className="text-lg px-5 py-3 data-[state=active]:bg-[#e8f4ee] data-[state=active]:text-[#217346] data-[state=active]:border-b-2 data-[state=active]:border-[#217346]"
          >
            Visualizations
          </TabsTrigger>
          <TabsTrigger
            value="ingestion"
            className="text-lg px-5 py-3 data-[state=active]:bg-[#e8f4ee] data-[state=active]:text-[#217346] data-[state=active]:border-b-2 data-[state=active]:border-[#217346]"
          >
            Upload Data
          </TabsTrigger>
        </TabsList>
      </div>
      
      {children}
    </Tabs>
  );
}