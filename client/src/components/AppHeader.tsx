import StatusIndicator from "@/components/StatusIndicator";
import UserMenu from "@/components/UserMenu";

export default function AppHeader() {
  return (
    <header className="bg-white shadow-sm">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-neutral-500">Arbitration Data Management System</h1>
          <div className="flex items-center space-x-4">
            <StatusIndicator status="ready" label="System Ready" />
            <UserMenu userName="Admin" />
          </div>
        </div>
      </div>
    </header>
  );
}
