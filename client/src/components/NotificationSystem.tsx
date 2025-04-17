import { useEffect, useState } from "react";

interface Notification {
  id: string;
  type: "success" | "error" | "warning";
  title: string;
  message: string;
}

interface NotificationSystemProps {
  notifications: Notification[];
  onRemove: (id: string) => void;
}

export default function NotificationSystem({ notifications, onRemove }: NotificationSystemProps) {
  const [visibleNotifications, setVisibleNotifications] = useState<Notification[]>([]);

  // Update visible notifications whenever the input notifications change
  useEffect(() => {
    setVisibleNotifications(notifications);
  }, [notifications]);

  // Get icon based on notification type
  const getIcon = (type: string) => {
    switch (type) {
      case "success":
        return (
          <svg className="w-5 h-5 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
        );
      case "error":
        return (
          <svg className="w-5 h-5 text-error" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
        );
      case "warning":
        return (
          <svg className="w-5 h-5 text-warning" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
          </svg>
        );
      default:
        return null;
    }
  };

  // Handle notification removal with animation
  const handleRemove = (id: string) => {
    // Find the notification element
    const notificationEl = document.getElementById(`notification-${id}`);
    
    // Add exit animation
    if (notificationEl) {
      notificationEl.classList.add("translate-x-full");
      
      // Remove after animation completes
      setTimeout(() => {
        onRemove(id);
      }, 300);
    } else {
      // If element not found, just remove it
      onRemove(id);
    }
  };

  if (visibleNotifications.length === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 space-y-2 z-50">
      {visibleNotifications.map((notification) => (
        <div
          id={`notification-${notification.id}`}
          key={notification.id}
          className="bg-white shadow-lg rounded-md p-3 flex items-start w-72 transform transition-transform duration-300 translate-x-0"
        >
          <div className="flex-shrink-0 mr-2">
            {getIcon(notification.type)}
          </div>
          <div className="flex-grow">
            <div className="text-[9pt] font-medium text-neutral-500">{notification.title}</div>
            <div className="text-[8pt] text-neutral-400">{notification.message}</div>
          </div>
          <button 
            className="flex-shrink-0 ml-2 text-neutral-300 hover:text-neutral-400"
            onClick={() => handleRemove(notification.id)}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
