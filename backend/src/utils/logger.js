// backend/src/utils/logger.js
// Simple logging utility with timestamps and colors

const fs = require('fs');
const path = require('path');

class Logger {
  constructor() {
    this.logsDir = path.join(__dirname, '../../..', 'logs');
    this.logFile = path.join(this.logsDir, `bot-${this.getDateString()}.log`);
    
    // Create logs directory if not exists
    if (!fs.existsSync(this.logsDir)) {
      fs.mkdirSync(this.logsDir, { recursive: true });
    }
  }

  getDateString() {
    const now = new Date();
    return now.toISOString().split('T')[0];
  }

  getTimestamp() {
    const now = new Date();
    return now.toISOString().replace('T', ' ').substring(0, 19);
  }

  formatMessage(level, message, data = null) {
    const timestamp = this.getTimestamp();
    let logMessage = `[${timestamp}] [${level}] ${message}`;
    
    if (data) {
      logMessage += ` ${JSON.stringify(data)}`;
    }
    
    return logMessage;
  }

  writeToFile(message) {
    try {
      fs.appendFileSync(this.logFile, message + '\n');
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }

  info(message, data = null) {
    const logMessage = this.formatMessage('INFO', message, data);
    console.log('\x1b[36m%s\x1b[0m', logMessage); // Cyan
    this.writeToFile(logMessage);
  }

  success(message, data = null) {
    const logMessage = this.formatMessage('SUCCESS', message, data);
    console.log('\x1b[32m%s\x1b[0m', logMessage); // Green
    this.writeToFile(logMessage);
  }

  warn(message, data = null) {
    const logMessage = this.formatMessage('WARN', message, data);
    console.log('\x1b[33m%s\x1b[0m', logMessage); // Yellow
    this.writeToFile(logMessage);
  }

  error(message, data = null) {
    const logMessage = this.formatMessage('ERROR', message, data);
    console.log('\x1b[31m%s\x1b[0m', logMessage); // Red
    this.writeToFile(logMessage);
    
    // If data is an Error object, log stack trace
    if (data instanceof Error) {
      const stackTrace = `[${this.getTimestamp()}] [STACK] ${data.stack}`;
      console.log('\x1b[31m%s\x1b[0m', stackTrace);
      this.writeToFile(stackTrace);
    }
  }

  debug(message, data = null) {
    const logMessage = this.formatMessage('DEBUG', message, data);
    console.log('\x1b[90m%s\x1b[0m', logMessage); // Gray
    this.writeToFile(logMessage);
  }
}

// Export singleton instance
module.exports = new Logger();