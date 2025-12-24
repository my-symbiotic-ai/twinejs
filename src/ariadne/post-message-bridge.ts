/**
 * Ariadne PostMessage Bridge for Twine
 *
 * Enables bidirectional communication between Twine (running in iframe)
 * and the parent Ariadne application via postMessage.
 */

// Event types matching Ariadne's TwineEventType
export type AriadneEventType =
  | 'SESSION_START'
  | 'SESSION_END'
  | 'NAVIGATE'
  | 'MAKE_CHOICE'
  | 'CHANGE_PASSAGE'
  | 'REWIND_PASSAGE'
  | 'STORY_UPDATE'
  | 'COMMENT'
  | 'CLOSE_EDITOR'
  | 'DOM_MUTATION'
  | 'VARIABLE_CHANGE'
  | 'INTERACTION'
  | 'TIMED_EVENT'
  | 'INPUT_CHANGE';

// Messages from parent to Twine
export interface TwineIncomingMessage {
  type:
    | 'twine:load-story'
    | 'twine:set-readonly'
    | 'twine:get-story'
    | 'twine:set-mode'
    | 'twine:start-playtest'
    | 'twine:stop-playtest'
    | 'twine:get-variables';
  payload?: unknown;
}

// Messages from Twine to parent
export interface TwineOutgoingMessage {
  type:
    | 'twine:ready'
    | 'twine:story-changed'
    | 'twine:event'
    | 'twine:action'
    | 'twine:variable-update'
    | 'twine:dom-mutation'
    | 'twine:error';
  payload: unknown;
}

// Event data structure
export interface AriadneEventData {
  type: AriadneEventType;
  timestamp: string;
  passageTitle?: string;
  content?: string;
  metadata?: {
    fromPassage?: string;
    toPassage?: string;
    passageId?: string;
    passageName?: string;
    action?: string;
    choiceIndex?: number;
    choiceText?: string;
    targetPassage?: string;
    variableName?: string;
    oldValue?: unknown;
    newValue?: unknown;
    macroType?: string;
    elementSelector?: string;
    mutationType?: 'replace' | 'append' | 'prepend' | 'remove';
    inputType?: string;
    inputValue?: string;
  };
}

// Allowed origins for security (configurable)
let allowedOrigins: string[] = ['*'];

// Message handlers registry
type MessageHandler = (payload: unknown) => void;
const messageHandlers: Map<string, MessageHandler> = new Map();

// Initialize state
let isInitialized = false;
let isEmbedded = false;

/**
 * Check if running in an iframe
 */
export function checkEmbedded(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

/**
 * Set allowed origins for postMessage security
 */
export function setAllowedOrigins(origins: string[]): void {
  allowedOrigins = origins;
}

/**
 * Verify message origin is allowed
 */
function isOriginAllowed(origin: string): boolean {
  if (allowedOrigins.includes('*')) return true;
  return allowedOrigins.includes(origin);
}

/**
 * Send message to parent window
 */
export function sendToParent(message: TwineOutgoingMessage): void {
  if (!isEmbedded) return;

  try {
    window.parent.postMessage(message, '*');
  } catch (error) {
    console.error('[Ariadne Bridge] Failed to send message to parent:', error);
  }
}

/**
 * Send event to parent (convenience wrapper)
 */
export function emitEvent(event: AriadneEventData): void {
  sendToParent({
    type: 'twine:event',
    payload: event
  });
}

/**
 * Register a handler for incoming messages
 */
export function onMessage(messageType: string, handler: MessageHandler): void {
  messageHandlers.set(messageType, handler);
}

/**
 * Handle incoming messages from parent
 */
function handleMessage(event: MessageEvent): void {
  if (!isOriginAllowed(event.origin)) {
    console.warn('[Ariadne Bridge] Rejected message from unauthorized origin:', event.origin);
    return;
  }

  const message = event.data as TwineIncomingMessage;
  if (!message || typeof message.type !== 'string') return;
  if (!message.type.startsWith('twine:')) return;

  console.log('[Ariadne Bridge] Received message:', message.type);

  const handler = messageHandlers.get(message.type);
  if (handler) {
    try {
      handler(message.payload);
    } catch (error) {
      console.error('[Ariadne Bridge] Error handling message:', error);
      sendToParent({
        type: 'twine:error',
        payload: {
          message: error instanceof Error ? error.message : 'Unknown error',
          originalMessage: message.type
        }
      });
    }
  } else {
    console.warn('[Ariadne Bridge] No handler for message type:', message.type);
  }
}

/**
 * Initialize the bridge
 */
export function initBridge(): void {
  if (isInitialized) return;

  isEmbedded = checkEmbedded();

  if (!isEmbedded) {
    console.log('[Ariadne Bridge] Not running in iframe, bridge disabled');
    return;
  }

  console.log('[Ariadne Bridge] Initializing postMessage bridge');

  // Listen for messages from parent
  window.addEventListener('message', handleMessage);

  // Notify parent that Twine is ready
  sendToParent({
    type: 'twine:ready',
    payload: {
      version: '2.0.0',
      features: [
        'load-story',
        'set-readonly',
        'get-story',
        'set-mode',
        'start-playtest',
        'stop-playtest',
        'events'
      ]
    }
  });

  isInitialized = true;
  console.log('[Ariadne Bridge] Bridge initialized');
}

/**
 * Check if bridge is active (running embedded)
 */
export function isBridgeActive(): boolean {
  return isInitialized && isEmbedded;
}

/**
 * Cleanup the bridge
 */
export function destroyBridge(): void {
  if (!isInitialized) return;

  window.removeEventListener('message', handleMessage);
  messageHandlers.clear();
  isInitialized = false;

  console.log('[Ariadne Bridge] Bridge destroyed');
}
