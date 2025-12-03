/**
 * Sherlock Integration Module
 *
 * Entry point for all Sherlock-specific functionality in Twine.
 */

export * from './post-message-bridge';
export * from './state-integration';
export * from './dom-observer';

import { initBridge, isBridgeActive, onMessage, sendToParent } from './post-message-bridge';
import { startDOMObserver, stopDOMObserver } from './dom-observer';

/**
 * Initialize all Sherlock integrations
 */
export function initSherlock(): void {
  console.log('[Sherlock] Initializing Sherlock integration...');

  // Initialize the postMessage bridge
  initBridge();

  if (!isBridgeActive()) {
    console.log('[Sherlock] Not running in iframe, skipping integration');
    return;
  }

  // Register message handlers for parent commands
  setupMessageHandlers();

  console.log('[Sherlock] Sherlock integration initialized');
}

/**
 * Set up handlers for messages from the parent window
 */
function setupMessageHandlers(): void {
  // Handle load-story command
  onMessage('twine:load-story', (payload) => {
    console.log('[Sherlock] Received load-story command:', payload);
    // This will be handled by a custom hook or component
    window.dispatchEvent(new CustomEvent('sherlock:load-story', { detail: payload }));
  });

  // Handle set-readonly command
  onMessage('twine:set-readonly', (payload) => {
    console.log('[Sherlock] Received set-readonly command:', payload);
    window.dispatchEvent(new CustomEvent('sherlock:set-readonly', { detail: payload }));
  });

  // Handle get-story command (request current story state)
  onMessage('twine:get-story', (payload) => {
    console.log('[Sherlock] Received get-story command');
    window.dispatchEvent(new CustomEvent('sherlock:get-story', { detail: payload }));
  });

  // Handle set-mode command (edit/play mode)
  onMessage('twine:set-mode', (payload) => {
    console.log('[Sherlock] Received set-mode command:', payload);
    window.dispatchEvent(new CustomEvent('sherlock:set-mode', { detail: payload }));
  });

  // Handle start-playtest command
  onMessage('twine:start-playtest', (payload) => {
    console.log('[Sherlock] Received start-playtest command:', payload);
    window.dispatchEvent(new CustomEvent('sherlock:start-playtest', { detail: payload }));
    // Start DOM observation when playtest begins
    // Delay slightly to allow playtest iframe/content to load
    setTimeout(() => {
      startDOMObserver();
    }, 500);
  });

  // Handle stop-playtest command
  onMessage('twine:stop-playtest', () => {
    console.log('[Sherlock] Received stop-playtest command');
    window.dispatchEvent(new CustomEvent('sherlock:stop-playtest'));
    // Stop DOM observation when playtest ends
    stopDOMObserver();
  });

  // Handle get-variables command
  onMessage('twine:get-variables', () => {
    console.log('[Sherlock] Received get-variables command');
    window.dispatchEvent(new CustomEvent('sherlock:get-variables'));
  });
}

// Auto-initialize when module is loaded
if (typeof window !== 'undefined') {
  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSherlock);
  } else {
    initSherlock();
  }
}
