/**
 * Application logger — thin wrapper over electron-log.
 * Main process:  import { log } from '@/main/lib/logger'
 * Preload:       exposed via electronAPI.log.*
 * Renderer:      window.electronAPI.log.*
 * Logs are written to rotating files in the OS-standard location:
 *   macOS  — ~/Library/Logs/Slate/main.log
 *   Linux  — ~/.config/Slate/logs/main.log
 */
import baseLog from 'electron-log/main';

export const log = baseLog;

// Keep log files small — 1 MB max, 1 rotated backup
baseLog.transports.file.maxSize = 1024 * 1024;
