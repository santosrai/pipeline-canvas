/**
 * Comprehensive Error Logging and Monitoring System
 * Tracks, logs, and reports errors for debugging and analytics
 */

import { ErrorDetails, ErrorCategory, ErrorSeverity } from './errorHandler';

export interface ErrorLogEntry {
  id: string;
  timestamp: Date;
  error: ErrorDetails;
  userAgent: string;
  url: string;
  userId?: string;
  sessionId: string;
  buildVersion: string;
  additionalContext?: Record<string, any>;
}

export interface ErrorMetrics {
  totalErrors: number;
  errorsByCategory: Record<ErrorCategory, number>;
  errorsBySeverity: Record<ErrorSeverity, number>;
  errorsByCode: Record<string, number>;
  recentErrors: ErrorLogEntry[];
  errorRate: number; // errors per minute
}

class ErrorLogger {
  private logs: ErrorLogEntry[] = [];
  private sessionId: string;
  private buildVersion: string = '1.0.0'; // Would be injected during build
  private maxLogEntries: number = 1000;
  private metrics: ErrorMetrics = {
    totalErrors: 0,
    errorsByCategory: {} as Record<ErrorCategory, number>,
    errorsBySeverity: {} as Record<ErrorSeverity, number>,
    errorsByCode: {},
    recentErrors: [],
    errorRate: 0
  };

  constructor() {
    this.sessionId = this.generateSessionId();
    this.initializeMetrics();
    
    // Set up periodic metrics calculation
    setInterval(() => this.updateMetrics(), 60000); // Update every minute
    
    // Set up periodic log cleanup
    setInterval(() => this.cleanupOldLogs(), 300000); // Cleanup every 5 minutes
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private initializeMetrics(): void {
    // Initialize category counters
    Object.values(ErrorCategory).forEach(category => {
      this.metrics.errorsByCategory[category as ErrorCategory] = 0;
    });
    
    // Initialize severity counters
    Object.values(ErrorSeverity).forEach(severity => {
      this.metrics.errorsBySeverity[severity as ErrorSeverity] = 0;
    });
  }

  /**
   * Log an error with full context
   */
  logError(
    error: ErrorDetails, 
    additionalContext?: Record<string, any>,
    userId?: string
  ): ErrorLogEntry {
    const logEntry: ErrorLogEntry = {
      id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      error,
      userAgent: navigator.userAgent,
      url: window.location.href,
      userId,
      sessionId: this.sessionId,
      buildVersion: this.buildVersion,
      additionalContext
    };

    // Add to logs
    this.logs.push(logEntry);
    
    // Update metrics
    this.metrics.totalErrors++;
    this.metrics.errorsByCategory[error.category]++;
    this.metrics.errorsBySeverity[error.severity]++;
    this.metrics.errorsByCode[error.code] = (this.metrics.errorsByCode[error.code] || 0) + 1;
    this.metrics.recentErrors.unshift(logEntry);
    
    // Keep only recent errors in metrics
    this.metrics.recentErrors = this.metrics.recentErrors.slice(0, 50);

    // Console logging based on severity
    this.consoleLog(logEntry);

    // Send to external logging service if configured
    this.sendToExternalService(logEntry);

    // Trigger alerts for critical errors
    if (error.severity === ErrorSeverity.CRITICAL) {
      this.triggerCriticalAlert(logEntry);
    }

    return logEntry;
  }

  private consoleLog(logEntry: ErrorLogEntry): void {
    const { error } = logEntry;
    const prefix = `[AlphaFold Error ${error.code}]`;
    
    switch (error.severity) {
      case ErrorSeverity.LOW:
        console.warn(prefix, error.userMessage, { details: logEntry });
        break;
      case ErrorSeverity.MEDIUM:
        console.warn(prefix, error.userMessage, { details: logEntry });
        break;
      case ErrorSeverity.HIGH:
        console.error(prefix, error.userMessage, { details: logEntry });
        break;
      case ErrorSeverity.CRITICAL:
        console.error(prefix, error.userMessage, { details: logEntry });
        if (error.stack) console.error('Stack:', error.stack);
        break;
    }
  }

  private async sendToExternalService(logEntry: ErrorLogEntry): Promise<void> {
    // Only send medium+ severity errors to external service
    if (logEntry.error.severity === ErrorSeverity.LOW) {
      return;
    }

    try {
      // Example: Send to logging service
      // In production, you might use services like Sentry, LogRocket, etc.
      const payload = {
        ...logEntry,
        // Remove potentially sensitive information
        userAgent: logEntry.userAgent.slice(0, 200),
        additionalContext: this.sanitizeContext(logEntry.additionalContext)
      };

      // Simulate sending to logging service
      await fetch('/api/logs/error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).catch(() => {
        // Fail silently - don't let logging errors affect the user
      });
    } catch (e) {
      // Fail silently
    }
  }

  private sanitizeContext(context?: Record<string, any>): Record<string, any> {
    if (!context) return {};
    
    const sanitized: Record<string, any> = {};
    const sensitiveKeys = ['password', 'token', 'key', 'secret', 'apikey'];
    
    Object.entries(context).forEach(([key, value]) => {
      const lowerKey = key.toLowerCase();
      if (sensitiveKeys.some(sensitive => lowerKey.includes(sensitive))) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'string' && value.length > 1000) {
        sanitized[key] = value.slice(0, 1000) + '... [TRUNCATED]';
      } else {
        sanitized[key] = value;
      }
    });
    
    return sanitized;
  }

  private triggerCriticalAlert(logEntry: ErrorLogEntry): void {
    // Could integrate with alerting systems
    console.error('🚨 CRITICAL ERROR ALERT:', logEntry.error.userMessage);
    
    // Could send to monitoring services like PagerDuty, Slack, etc.
    // this.sendSlackAlert(logEntry);
    // this.sendEmailAlert(logEntry);
  }

  private updateMetrics(): void {
    // Calculate error rate (errors per minute)
    const oneMinuteAgo = new Date(Date.now() - 60000);
    const recentErrors = this.logs.filter(log => log.timestamp > oneMinuteAgo);
    this.metrics.errorRate = recentErrors.length;
  }

  private cleanupOldLogs(): void {
    // Keep only last 1000 log entries
    if (this.logs.length > this.maxLogEntries) {
      this.logs = this.logs.slice(-this.maxLogEntries);
    }
  }

  /**
   * Get current error metrics
   */
  getMetrics(): ErrorMetrics {
    return { ...this.metrics };
  }

  /**
   * Get all logs (for debugging)
   */
  getAllLogs(): ErrorLogEntry[] {
    return [...this.logs];
  }

  /**
   * Get logs filtered by criteria
   */
  getFilteredLogs(filter: {
    category?: ErrorCategory;
    severity?: ErrorSeverity;
    code?: string;
    since?: Date;
    userId?: string;
  }): ErrorLogEntry[] {
    return this.logs.filter(log => {
      if (filter.category && log.error.category !== filter.category) return false;
      if (filter.severity && log.error.severity !== filter.severity) return false;
      if (filter.code && log.error.code !== filter.code) return false;
      if (filter.since && log.timestamp < filter.since) return false;
      if (filter.userId && log.userId !== filter.userId) return false;
      return true;
    });
  }

  /**
   * Export logs for analysis
   */
  exportLogs(format: 'json' | 'csv' = 'json'): string {
    if (format === 'csv') {
      const headers = ['timestamp', 'code', 'category', 'severity', 'userMessage', 'url', 'sessionId'];
      const rows = this.logs.map(log => [
        log.timestamp.toISOString(),
        log.error.code,
        log.error.category,
        log.error.severity,
        log.error.userMessage,
        log.url,
        log.sessionId
      ]);
      
      return [headers, ...rows].map(row => row.join(',')).join('\n');
    } else {
      return JSON.stringify(this.logs, null, 2);
    }
  }

  /**
   * Clear all logs (for testing)
   */
  clearLogs(): void {
    this.logs = [];
    this.initializeMetrics();
  }

  /**
   * Get error patterns and insights
   */
  getErrorInsights(): {
    mostCommonErrors: Array<{ code: string; count: number }>;
    errorTrends: Array<{ hour: number; count: number }>;
    userImpact: { affectedUsers: number; totalSessions: number };
  } {
    // Most common errors
    const mostCommonErrors = Object.entries(this.metrics.errorsByCode)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([code, count]) => ({ code, count }));

    // Error trends by hour
    const hourlyErrors: Record<number, number> = {};
    this.logs.forEach(log => {
      const hour = log.timestamp.getHours();
      hourlyErrors[hour] = (hourlyErrors[hour] || 0) + 1;
    });
    
    const errorTrends = Object.entries(hourlyErrors)
      .map(([hour, count]) => ({ hour: parseInt(hour), count }))
      .sort((a, b) => a.hour - b.hour);

    // User impact
    const uniqueUsers = new Set(this.logs.map(log => log.userId).filter(Boolean));
    const uniqueSessions = new Set(this.logs.map(log => log.sessionId));

    return {
      mostCommonErrors,
      errorTrends,
      userImpact: {
        affectedUsers: uniqueUsers.size,
        totalSessions: uniqueSessions.size
      }
    };
  }
}

// Global error logger instance
export const errorLogger = new ErrorLogger();

// Utility functions
export function logAlphaFoldError(
  error: ErrorDetails,
  context?: Record<string, any>,
  userId?: string
): ErrorLogEntry {
  return errorLogger.logError(error, {
    feature: 'AlphaFold',
    ...context
  }, userId);
}

export function getErrorDashboardData() {
  return {
    metrics: errorLogger.getMetrics(),
    insights: errorLogger.getErrorInsights(),
    recentLogs: errorLogger.getFilteredLogs({ since: new Date(Date.now() - 3600000) }) // Last hour
  };
}