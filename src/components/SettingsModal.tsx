import React from 'react';
import { Download, ExternalLink, Bell, Settings, Volume2, X } from 'lucide-react';
import { BeforeInstallPromptEvent } from '../types/pwa';
import { AlertPreferences, isAlertVoiceStyle } from '../types/alerts';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  installPrompt: BeforeInstallPromptEvent | null;
  isInstalled: boolean;
  installError: string;
  onInstall: () => void;
  alertPreferences: AlertPreferences;
  notificationPermission: NotificationPermission | 'unsupported';
  alertSettingsError: string;
  onToggleNotifications: () => void;
  onToggleVoiceAlerts: () => void;
  onChangeVoiceStyle: (style: AlertPreferences['voiceStyle']) => void;
  onTestVoice: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  installPrompt,
  isInstalled,
  installError,
  onInstall,
  alertPreferences,
  notificationPermission,
  alertSettingsError,
  onToggleNotifications,
  onToggleVoiceAlerts,
  onChangeVoiceStyle,
  onTestVoice,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className="w-full sm:max-w-lg max-h-[90dvh] overflow-y-auto rounded-t-3xl sm:rounded-3xl border border-slate-800 bg-slate-900 p-5 sm:p-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-950/70 border border-rose-800/70 flex items-center justify-center">
              <Settings className="w-5 h-5 text-rose-300" />
            </div>
            <div>
              <h2 id="settings-title" className="text-lg font-bold text-slate-100">Settings</h2>
              <p className="text-xs text-slate-400">App preferences and installation</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-xl bg-slate-800 text-slate-300 hover:text-white flex items-center justify-center"
            aria-label="Close settings"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950/70 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <Download className="w-5 h-5 text-emerald-300 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-slate-100">Install Application</h3>
              <p className="mt-1 text-sm text-slate-400">
                Add TrapDetector to your device for a standalone app experience.
              </p>
            </div>
          </div>

          {!isInstalled && installPrompt && (
            <button
              type="button"
              onClick={onInstall}
              className="mt-5 w-full min-h-12 rounded-xl bg-emerald-400 hover:bg-emerald-300 px-4 py-3 text-sm font-bold text-slate-950 flex items-center justify-center gap-2 transition-all duration-300"
            >
              <Download className="w-4 h-4" />
              Install TrapDetector App
            </button>
          )}

          {installError && (
            <p role="alert" className="mt-3 text-sm text-rose-300">{installError}</p>
          )}

          {isInstalled && (
            <p className="mt-4 rounded-xl border border-emerald-900/70 bg-emerald-950/30 px-3 py-2.5 text-sm text-emerald-200">
              TrapDetector is installed on this device.
            </p>
          )}

          {!isInstalled && !installPrompt && (
            <p className="mt-4 text-xs text-slate-400 flex items-start gap-2">
              <ExternalLink className="w-4 h-4 shrink-0" />
              Installation is not available yet in this browser. Use HTTPS, then try the browser’s
              Install App or Add to Home Screen menu.
            </p>
          )}
        </div>

        <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/70 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <Bell className="w-5 h-5 text-amber-300 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-slate-100">Notifications &amp; Sound Alerts</h3>
              <p className="mt-1 text-sm text-slate-400">
                Alerts are sent only when a coin enters a new MTF signal state.
              </p>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            <label className="flex items-center justify-between gap-4 rounded-xl border border-slate-800 px-3 py-3">
              <span>
                <span className="block text-sm font-medium text-slate-200">Browser notifications</span>
                <span className="mt-0.5 block text-xs text-slate-500">
                  Permission: {notificationPermission}
                </span>
              </span>
              <input
                type="checkbox"
                checked={alertPreferences.browserNotifications}
                onChange={onToggleNotifications}
                disabled={notificationPermission === 'unsupported'}
                className="h-5 w-5 accent-amber-400"
                aria-label="Enable browser notifications"
              />
            </label>

            <label className="flex items-center justify-between gap-4 rounded-xl border border-slate-800 px-3 py-3">
              <span className="flex items-center gap-2 text-sm font-medium text-slate-200">
                <Volume2 className="h-4 w-4 text-violet-300" />
                Voice alerts
              </span>
              <input
                type="checkbox"
                checked={alertPreferences.voiceAlerts}
                onChange={onToggleVoiceAlerts}
                className="h-5 w-5 accent-violet-400"
                aria-label="Enable voice alerts"
              />
            </label>

            {alertPreferences.voiceAlerts && (
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
                <select
                  value={alertPreferences.voiceStyle}
                  onChange={(event) => {
                    if (isAlertVoiceStyle(event.target.value)) {
                      onChangeVoiceStyle(event.target.value);
                    }
                  }}
                  className="min-h-11 rounded-xl border border-slate-800 bg-slate-900 px-3 text-sm text-slate-200"
                  aria-label="Voice alert style"
                >
                  <option value="trade">Funny: “Trade trade trade!”</option>
                  <option value="paisa">Funny: “Paisa paisa paisa!”</option>
                  <option value="clear">Clear signal announcement</option>
                </select>
                <button
                  type="button"
                  onClick={onTestVoice}
                  className="min-h-11 rounded-xl border border-violet-800 bg-violet-950/50 px-4 text-sm font-semibold text-violet-200 hover:bg-violet-900/60"
                >
                  Test voice
                </button>
              </div>
            )}
          </div>

          {alertSettingsError && (
            <p role="alert" className="mt-3 text-sm text-rose-300">{alertSettingsError}</p>
          )}

          {notificationPermission === 'denied' && (
            <p className="mt-3 text-xs text-amber-200">
              Notifications are blocked by your browser. Allow them in site settings, then reopen this setting.
            </p>
          )}
        </div>
      </section>
    </div>
  );
};
