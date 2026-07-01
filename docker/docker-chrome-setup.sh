#!/bin/bash
# Chrome setup for Puppeteer (WhatsApp MCP)
if [ -f /opt/chrome-linux64/chrome ]; then
  ln -sf /opt/chrome-linux64/chrome /usr/local/bin/google-chrome 2>/dev/null
fi
