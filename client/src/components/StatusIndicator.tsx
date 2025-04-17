interface StatusIndicatorProps {
  status: "ready" | "processing" | "error";
  label: string;
}

export default function StatusIndicator({ status, label }: StatusIndicatorProps) {
  const statusColorMap = {
    ready: "bg-success",
    processing: "bg-warning",
    error: "bg-error"
  };

  return (
    <div className="flex items-center space-x-2">
      <span className={`h-2 w-2 rounded-full ${statusColorMap[status]}`}></span>
      <span className="text-[9pt] text-neutral-400">{label}</span>
    </div>
  );
}
