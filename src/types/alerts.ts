export type AlertVoiceStyle = 'trade' | 'paisa' | 'clear';

export interface AlertPreferences {
  browserNotifications: boolean;
  voiceAlerts: boolean;
  voiceStyle: AlertVoiceStyle;
}

export function isAlertVoiceStyle(value: unknown): value is AlertVoiceStyle {
  return value === 'trade' || value === 'paisa' || value === 'clear';
}
