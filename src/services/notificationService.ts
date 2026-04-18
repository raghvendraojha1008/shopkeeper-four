import { Capacitor } from '@capacitor/core';

export interface ReminderItem {
  id: number;
  title: string;
  body: string;
  scheduleAt?: Date;
}

export class NotificationService {
  static async requestPermission(): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) return false;
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      const result = await LocalNotifications.requestPermissions();
      return result.display === 'granted';
    } catch (e) {
      console.warn('Notifications not available:', e);
      return false;
    }
  }

  static async schedule(items: ReminderItem[]): Promise<void> {
    if (!Capacitor.isNativePlatform() || items.length === 0) return;
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      const granted = await NotificationService.requestPermission();
      if (!granted) return;

      await LocalNotifications.schedule({
        notifications: items.map(item => ({
          id: item.id,
          title: item.title,
          body: item.body,
          schedule: item.scheduleAt ? { at: item.scheduleAt } : undefined,
          sound: undefined,
          attachments: undefined,
          actionTypeId: '',
          extra: null,
        }))
      });
    } catch (e) {
      console.warn('Failed to schedule notifications:', e);
    }
  }

  static async cancelAll(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      const pending = await LocalNotifications.getPending();
      if (pending.notifications.length > 0) {
        await LocalNotifications.cancel({ notifications: pending.notifications });
      }
    } catch (e) {
      console.warn('Failed to cancel notifications:', e);
    }
  }

  static async scheduleLowStockAlert(lowStockItems: any[]): Promise<void> {
    if (!Capacitor.isNativePlatform() || lowStockItems.length === 0) return;
    const names = lowStockItems.slice(0, 3).map((i: any) => i.name).join(', ');
    const extra = lowStockItems.length > 3 ? ` +${lowStockItems.length - 3} more` : '';
    await NotificationService.schedule([{
      id: 1001,
      title: '⚠️ Low Stock Alert',
      body: `${names}${extra} are running low`,
    }]);
  }

  static async scheduleOverdueReminder(partyName: string, amount: number, daysOverdue: number): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    await NotificationService.schedule([{
      id: Math.abs(partyName.split('').reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 0)) % 9000 + 1000,
      title: '💰 Payment Due',
      body: `${partyName} owes ₹${amount.toLocaleString('en-IN')} — ${daysOverdue} days overdue`,
    }]);
  }

  static async scheduleDailySummary(sales: number, expenses: number): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    const tomorrow2am = new Date();
    tomorrow2am.setDate(tomorrow2am.getDate() + 1);
    tomorrow2am.setHours(8, 0, 0, 0);

    await NotificationService.schedule([{
      id: 2001,
      title: '📊 Daily Summary',
      body: `Sales: ₹${sales.toLocaleString('en-IN')} | Expenses: ₹${expenses.toLocaleString('en-IN')}`,
      scheduleAt: tomorrow2am,
    }]);
  }
}
