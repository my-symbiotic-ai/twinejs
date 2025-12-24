/**
 * Ariadne DOM Observer
 *
 * Uses MutationObserver to track DOM changes during story playtest.
 * This captures dynamic content updates from story formats like Harlowe,
 * SugarCube, etc.
 */

import { emitEvent, isBridgeActive, sendToParent, AriadneEventData } from './post-message-bridge';

// Observer instance
let observer: MutationObserver | null = null;
let isObserving = false;

// Debounce timer for batching mutations
let mutationBuffer: MutationRecord[] = [];
let debounceTimer: number | null = null;
const DEBOUNCE_MS = 100;

// Container selectors for different story formats
const STORY_CONTAINER_SELECTORS = [
  // Harlowe
  'tw-story',
  'tw-passage',
  // SugarCube
  '#story',
  '#passages',
  '.passage',
  // Chapbook
  '.page',
  // Snowman
  '#passage',
  // Generic
  '[data-passage]',
  '.story-content'
];

/**
 * Get a unique selector for an element
 */
function getElementSelector(element: Element): string {
  if (element.id) {
    return `#${element.id}`;
  }

  if (element.className && typeof element.className === 'string') {
    const classes = element.className.split(' ').filter(c => c.trim());
    if (classes.length > 0) {
      return `${element.tagName.toLowerCase()}.${classes.join('.')}`;
    }
  }

  return element.tagName.toLowerCase();
}

/**
 * Determine mutation type based on changes
 */
function getMutationType(mutation: MutationRecord): 'replace' | 'append' | 'prepend' | 'remove' {
  if (mutation.type === 'childList') {
    if (mutation.removedNodes.length > 0 && mutation.addedNodes.length === 0) {
      return 'remove';
    }
    if (mutation.addedNodes.length > 0 && mutation.removedNodes.length === 0) {
      // Check if it's prepend or append based on position
      const target = mutation.target as Element;
      if (target.firstChild === mutation.addedNodes[0]) {
        return 'prepend';
      }
      return 'append';
    }
    return 'replace';
  }

  return 'replace';
}

/**
 * Process buffered mutations and emit events
 */
function processMutations(): void {
  if (mutationBuffer.length === 0) return;
  if (!isBridgeActive()) {
    mutationBuffer = [];
    return;
  }

  // Group mutations by target element
  const groupedMutations = new Map<Element, MutationRecord[]>();

  for (const mutation of mutationBuffer) {
    const target = mutation.target as Element;
    if (!groupedMutations.has(target)) {
      groupedMutations.set(target, []);
    }
    groupedMutations.get(target)!.push(mutation);
  }

  // Emit events for significant mutations
  for (const [target, mutations] of groupedMutations) {
    // Skip if target is not an element or is part of Twine's UI (not story content)
    if (!(target instanceof Element)) continue;
    if (target.closest('.toolbar, .modal, .menu, [data-twine-ui]')) continue;

    // Get the first mutation to determine type
    const firstMutation = mutations[0];
    const mutationType = getMutationType(firstMutation);

    // Get content for the mutation
    let content = '';
    if (firstMutation.type === 'childList' && firstMutation.addedNodes.length > 0) {
      const addedContent: string[] = [];
      firstMutation.addedNodes.forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          addedContent.push((node as Element).outerHTML);
        } else if (node.nodeType === Node.TEXT_NODE) {
          addedContent.push(node.textContent || '');
        }
      });
      content = addedContent.join('');
    } else if (firstMutation.type === 'characterData') {
      content = target.textContent || '';
    }

    // Find the passage context
    const passageElement = target.closest('tw-passage, .passage, [data-passage]');
    const passageTitle = passageElement?.getAttribute('data-passage') ||
                        passageElement?.getAttribute('name') ||
                        undefined;

    const event: AriadneEventData = {
      type: 'DOM_MUTATION',
      timestamp: new Date().toISOString(),
      passageTitle,
      content: content.substring(0, 1000), // Limit content size
      metadata: {
        elementSelector: getElementSelector(target),
        mutationType,
        action: `dom_${mutationType}`
      }
    };

    console.log('[Ariadne DOM] Mutation detected:', event.metadata?.elementSelector, mutationType);
    emitEvent(event);
  }

  mutationBuffer = [];
}

/**
 * Handle mutation callback with debouncing
 */
function handleMutations(mutations: MutationRecord[]): void {
  // Add to buffer
  mutationBuffer.push(...mutations);

  // Clear existing timer
  if (debounceTimer !== null) {
    window.clearTimeout(debounceTimer);
  }

  // Set new timer
  debounceTimer = window.setTimeout(processMutations, DEBOUNCE_MS);
}

/**
 * Find the story container element
 */
function findStoryContainer(): Element | null {
  for (const selector of STORY_CONTAINER_SELECTORS) {
    const element = document.querySelector(selector);
    if (element) {
      return element;
    }
  }
  return document.body;
}

/**
 * Start observing DOM mutations in the story container
 */
export function startDOMObserver(container?: Element): void {
  if (isObserving) {
    console.log('[Ariadne DOM] Already observing');
    return;
  }

  if (!isBridgeActive()) {
    console.log('[Ariadne DOM] Bridge not active, skipping DOM observer');
    return;
  }

  const targetContainer = container || findStoryContainer();
  if (!targetContainer) {
    console.warn('[Ariadne DOM] No story container found');
    return;
  }

  observer = new MutationObserver(handleMutations);

  observer.observe(targetContainer, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['class', 'style', 'hidden', 'disabled']
  });

  isObserving = true;
  console.log('[Ariadne DOM] Started observing:', getElementSelector(targetContainer));

  // Notify parent that observation started
  sendToParent({
    type: 'twine:event',
    payload: {
      type: 'SESSION_START',
      timestamp: new Date().toISOString(),
      metadata: {
        action: 'dom_observer_started',
        elementSelector: getElementSelector(targetContainer)
      }
    }
  });
}

/**
 * Stop observing DOM mutations
 */
export function stopDOMObserver(): void {
  if (!isObserving || !observer) {
    return;
  }

  // Process any remaining mutations
  if (debounceTimer !== null) {
    window.clearTimeout(debounceTimer);
    processMutations();
  }

  observer.disconnect();
  observer = null;
  isObserving = false;
  mutationBuffer = [];

  console.log('[Ariadne DOM] Stopped observing');

  // Notify parent that observation stopped
  if (isBridgeActive()) {
    sendToParent({
      type: 'twine:event',
      payload: {
        type: 'SESSION_END',
        timestamp: new Date().toISOString(),
        metadata: {
          action: 'dom_observer_stopped'
        }
      }
    });
  }
}

/**
 * Check if DOM observer is active
 */
export function isDOMObserverActive(): boolean {
  return isObserving;
}

/**
 * Manually trigger a content snapshot
 */
export function captureContentSnapshot(passageTitle?: string): void {
  if (!isBridgeActive()) return;

  const container = findStoryContainer();
  if (!container) return;

  const event: AriadneEventData = {
    type: 'DOM_MUTATION',
    timestamp: new Date().toISOString(),
    passageTitle,
    content: container.innerHTML.substring(0, 5000),
    metadata: {
      elementSelector: getElementSelector(container),
      mutationType: 'replace',
      action: 'content_snapshot'
    }
  };

  emitEvent(event);
}
