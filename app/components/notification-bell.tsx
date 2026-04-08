import { useState, useRef, useEffect } from "react";
import { useNavigate, useFetcher } from "react-router";
import { Bell } from "lucide-react";
import { cn } from "~/lib/utils";

function timeAgo(isoString: string): string {
  const seconds = Math.floor(
    (Date.now() - new Date(isoString).getTime()) / 1000
  );
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

interface Notification {
  id: number;
  title: string;
  message: string;
  linkUrl: string;
  isRead: boolean;
  createdAt: string;
}

interface NotificationBellProps {
  notifications: Notification[];
  unreadCount: number;
}

export function NotificationBell({
  notifications,
  unreadCount,
}: NotificationBellProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const markReadFetcher = useFetcher();
  const markAllFetcher = useFetcher();

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleNotificationClick(notification: Notification) {
    if (!notification.isRead) {
      markReadFetcher.submit(
        { notificationId: notification.id },
        {
          method: "post",
          action: "/api/notifications/mark-read",
          encType: "application/json",
        }
      );
    }
    setIsOpen(false);
    navigate(notification.linkUrl);
  }

  function handleMarkAllRead() {
    markAllFetcher.submit(
      {},
      { method: "post", action: "/api/notifications/mark-all-read" }
    );
    setIsOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="relative rounded-md p-1 text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        title="Notifications"
      >
        <Bell className="size-4" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute left-full top-0 z-50 ml-2 w-80 rounded-md border border-sidebar-border bg-popover shadow-lg">
          <div className="flex items-center justify-between border-b border-sidebar-border px-3 py-2">
            <span className="text-sm font-semibold">Notifications</span>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                Mark all as read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                No notifications
              </div>
            ) : (
              notifications.map((notification) => (
                <button
                  key={notification.id}
                  onClick={() => handleNotificationClick(notification)}
                  className={cn(
                    "flex w-full flex-col gap-1 px-3 py-3 text-left transition-colors hover:bg-accent",
                    !notification.isRead && "bg-accent/50"
                  )}
                >
                  <div className="flex items-start gap-2">
                    {!notification.isRead && (
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-500" />
                    )}
                    <div className={cn(!notification.isRead ? "ml-0" : "ml-4")}>
                      <div className="text-sm font-medium">
                        {notification.title}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {notification.message}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground/70">
                        {timeAgo(notification.createdAt)}
                      </div>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
