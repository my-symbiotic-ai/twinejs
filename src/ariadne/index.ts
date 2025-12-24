/**
 * Ariadne Integration Module
 *
 * Entry point for all Ariadne-specific functionality in Twine.
 */

export * from './post-message-bridge';
export * from './state-integration';
export * from './dom-observer';

import { initBridge, isBridgeActive, onMessage } from './post-message-bridge';
import { startDOMObserver, stopDOMObserver } from './dom-observer';

/**
 * Initialize all Ariadne integrations
 */
export function initAriadne(): void {
  console.log('[Ariadne] Initializing Ariadne integration...');

  // Initialize the postMessage bridge
  initBridge();

  if (!isBridgeActive()) {
    console.log('[Ariadne] Not running in iframe, skipping integration');
    return;
  }

  // Register message handlers for parent commands
  setupMessageHandlers();

  console.log('[Ariadne] Ariadne integration initialized');
}

/**
 * Set up handlers for messages from the parent window
 */
function setupMessageHandlers(): void {
  // Handle load-story command
  onMessage('twine:load-story', (payload) => {
    console.log('[Ariadne] Received load-story command:', payload);
    // This will be handled by a custom hook or component
    window.dispatchEvent(new CustomEvent('ariadne:load-story', { detail: payload }));
  });

  // Handle set-readonly command
  onMessage('twine:set-readonly', (payload) => {
    console.log('[Ariadne] Received set-readonly command:', payload);
    window.dispatchEvent(new CustomEvent('ariadne:set-readonly', { detail: payload }));
  });

  // Handle get-story command (request current story state)
  onMessage('twine:get-story', (payload) => {
    console.log('[Ariadne] Received get-story command');
    window.dispatchEvent(new CustomEvent('ariadne:get-story', { detail: payload }));
  });

  // Handle set-mode command (edit/play mode)
  onMessage('twine:set-mode', (payload) => {
    console.log('[Ariadne] Received set-mode command:', payload);
    window.dispatchEvent(new CustomEvent('ariadne:set-mode', { detail: payload }));
  });

  // Handle start-playtest command
  onMessage('twine:start-playtest', (payload) => {
    console.log('[Ariadne] Received start-playtest command:', payload);
    window.dispatchEvent(new CustomEvent('ariadne:start-playtest', { detail: payload }));
    // Start DOM observation when playtest begins
    // Delay slightly to allow playtest iframe/content to load
    setTimeout(() => {
      startDOMObserver();
    }, 500);
  });

  // Handle stop-playtest command
  onMessage('twine:stop-playtest', () => {
    console.log('[Ariadne] Received stop-playtest command');
    window.dispatchEvent(new CustomEvent('ariadne:stop-playtest'));
    // Stop DOM observation when playtest ends
    stopDOMObserver();
  });

  // Handle get-variables command
  onMessage('twine:get-variables', () => {
    console.log('[Ariadne] Received get-variables command');
    window.dispatchEvent(new CustomEvent('ariadne:get-variables'));
  });
}

// Auto-initialize when module is loaded
if (typeof window !== 'undefined') {
  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAriadne);
  } else {
    initAriadne();
  }
}
