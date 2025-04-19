import { useState } from "react";
import AppHeader from "@/components/AppHeader";
import FileUploadSection from "@/components/FileUploadSection";
import DataTable from "@/components/DataTable";
import ProcessingSummary from "@/components/ProcessingSummary";
import NotificationSystem from "@/components/NotificationSystem";
import NlpQueryPanel from "@/components/NlpQueryPanel";
import Navigation from "@/components/Navigation";
import { TabsContent } from "@/components/ui/tabs";
import { useQuery } from "@tanstack/react-query";

interface Notification {
  id: string;
  type: "success" | "error" | "warning";
  title: string;
  message: string;
}

export default function Home() {
  const [searchFilter, setSearchFilter] = useState<string>("");
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [tableRefreshTrigger, setTableRefreshTrigger] = useState<number>(0);
  
  // Fetch data summary
  const { data: summaryData, refetch: refetchSummary } = useQuery({
    queryKey: ['/api/summary'],
  });
  
  // Handle adding notifications
  const addNotification = (notification: Omit<Notification, "id">) => {
    const id = Date.now().toString();
    setNotifications(prev => [...prev, { ...notification, id }]);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
      removeNotification(id);
    }, 5000);
  };
  
  // Handle removing notifications
  const removeNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };
  
  // Handle file upload completion - refresh data
  const handleFileProcessed = (result: { 
    message: string, 
    recordsProcessed: number, 
    duplicatesFound: number 
  }) => {
    // Refresh table data
    setTableRefreshTrigger(prev => prev + 1);
    
    // Refresh summary data
    refetchSummary();
    
    // Check if this was a data clear operation
    if (result.message.includes('cleared') || result.message.includes('cleared all data')) {
      addNotification({
        type: "success",
        title: "Data Cleared Successfully",
        message: "All data has been removed from the database."
      });
      
      // Reload the page after a short delay to allow the notification to be shown
      setTimeout(() => {
        window.location.reload();
      }, 1000);
      
      return;
    }
    
    // Add appropriate notification for file processing
    if (result.duplicatesFound > 0) {
      addNotification({
        type: "warning",
        title: "Potential Duplicates Found",
        message: `${result.duplicatesFound} potential duplicate cases were identified.`
      });
    } else {
      addNotification({
        type: "success",
        title: "File Processed Successfully",
        message: `Processed ${result.recordsProcessed} records with no duplicates.`
      });
    }
    
    // Reload the page after a short delay to allow the notification to be shown
    setTimeout(() => {
      window.location.reload();
    }, 1000);
  };
  
  // Handle file processing error
  const handleFileError = (error: string) => {
    addNotification({
      type: "error",
      title: "File Processing Error",
      message: error
    });
  };
  
  // Handle search filter change
  const handleSearch = (filter: string) => {
    setSearchFilter(filter);
  };
  
  return (
    <div className="bg-neutral-100 min-h-screen">
      <AppHeader />
      
      <main className="container mx-auto px-4 py-6">
        <Navigation>
          {/* NLP Query Tab */}
          <TabsContent value="query" className="mt-4">
            <div className="grid grid-cols-1 gap-6">
              <div className="w-full">
                <NlpQueryPanel className="w-full" />
              </div>
              
              <div className="w-full">
                <DataTable 
                  filter={searchFilter}
                  refreshTrigger={tableRefreshTrigger}
                  onSearch={handleSearch}
                />
              </div>
            </div>
          </TabsContent>
          
          {/* Data Ingestion Tab */}
          <TabsContent value="ingestion" className="mt-4">
            <div className="grid grid-cols-1 gap-6">
              <div className="w-full">
                <FileUploadSection 
                  onFileProcessed={handleFileProcessed}
                  onFileError={handleFileError} 
                />
              </div>
              
              <div className="w-full">
                <ProcessingSummary 
                  summary={summaryData as any} 
                  refreshTrigger={tableRefreshTrigger}
                />
              </div>
              
              <div className="w-full">
                <DataTable 
                  filter={searchFilter}
                  refreshTrigger={tableRefreshTrigger}
                  onSearch={handleSearch}
                />
              </div>
            </div>
          </TabsContent>
        </Navigation>
      </main>
      
      <NotificationSystem 
        notifications={notifications}
        onRemove={removeNotification}
      />
    </div>
  );
}
