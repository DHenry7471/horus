export enum NotificationChannel {
  EMAIL = 'EMAIL',
  SMS = 'SMS',
  PUSH = 'PUSH',
}

export enum NotificationStatus {
  PENDING = 'PENDING',
  SENT = 'SENT',
  FAILED = 'FAILED',
}

export interface Notification {
  id: string;
  recipientId: string;
  channel: NotificationChannel;
  status: NotificationStatus;
  subject: string;
  body: string;
  correlationId: string;
  createdAt: string;
  sentAt?: string;
}
