import React, { createContext, useContext, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import { CheckCircle2, AlertCircle, Loader2, X } from 'lucide-react';

export type NotificationType = 'success' | 'error' | 'info';

interface Notification {
  id: string;
  type: NotificationType;
  message: string;
  duration?: number;
  isClosing?: boolean;
}

interface NotificationContextType {
  showNotification: (type: NotificationType, message: string, duration?: number) => string;
  hideNotification: (id: string) => void;
  clearNotifications: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const hideNotification = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isClosing: true } : n))
    );

    // Wait for animation to finish (300ms matches CSS)
    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    }, 300);
  }, []);

  const showNotification = useCallback((type: NotificationType, message: string, duration = 3000) => {
    const id = Math.random().toString(36).substring(2, 9);
    setNotifications((prev) => {
      return [...prev, { id, type, message, duration }];
    });

    if (duration > 0) {
      setTimeout(() => {
        hideNotification(id);
      }, duration);
    }

    return id;
  }, [hideNotification]);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  return (
    <NotificationContext.Provider value={{ showNotification, hideNotification, clearNotifications }}>
      {children}
      <div className="fixed bottom-8 right-8 flex flex-col gap-3 z-[2000] pointer-events-none">
        {notifications.map((n) => (
          <div 
            key={n.id} 
            className={`pointer-events-auto min-w-[320px] p-4 rounded-xl shadow-2xl flex items-center gap-3 bg-surface transition-all duration-300 ${
              n.isClosing ? 'animate-slide-out' : 'animate-slide-up'
            }`}
          >
            <div className="shrink-0 text-slate-500">
              {n.type === 'success' && <CheckCircle2 size={24} />}
              {n.type === 'error' && <AlertCircle size={24} />}
              {n.type === 'info' && <Loader2 className="animate-spin" size={24} />}
            </div>
            <span className="flex-1 font-bold text-sm text-slate-700">{n.message}</span>
            <button 
              onClick={() => hideNotification(n.id)} 
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 text-text-muted transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        ))}
      </div>
    </NotificationContext.Provider>
  );
};

export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
};
