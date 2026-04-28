/**
 * Ariadne State Integration
 *
 * Hooks into Twine's Redux-like state management to emit events
 * when stories and passages are modified.
 */

import { emitEvent, sendToParent, isBridgeActive, AriadneEventData } from './post-message-bridge';
import {
  StoriesAction,
  StoriesState,
  Story,
  Passage
} from '../store/stories/stories.types';

/**
 * Map Twine action types to Ariadne event types
 */
function mapActionToEventType(actionType: string): AriadneEventData['type'] | null {
  switch (actionType) {
    case 'createStory':
    case 'updateStory':
    case 'deleteStory':
    case 'createPassage':
    case 'createPassages':
    case 'updatePassage':
    case 'updatePassages':
    case 'deletePassage':
    case 'deletePassages':
      return 'STORY_UPDATE';
    default:
      return null;
  }
}

/**
 * Find a story by ID in the state
 */
function findStory(state: StoriesState, storyId: string): Story | undefined {
  return state.find(s => s.id === storyId);
}

/**
 * Find a passage in a story by ID
 */
function findPassage(story: Story | undefined, passageId: string): Passage | undefined {
  return story?.passages.find(p => p.id === passageId);
}

/**
 * Create event metadata from action
 */
function createEventMetadata(
  action: StoriesAction,
  prevState: StoriesState,
  newState: StoriesState
): NonNullable<AriadneEventData['metadata']> {
  const metadata: NonNullable<AriadneEventData['metadata']> = {};

  switch (action.type) {
    case 'createStory': {
      // Find the newly created story (exists in new state but not prev)
      const newStory = newState.find(s => !prevState.find(ps => ps.id === s.id));
      if (newStory) {
        metadata.action = 'create_story';
      }
      break;
    }

    case 'updateStory': {
      const story = findStory(newState, action.storyId);
      metadata.action = 'update_story';
      if (story) {
        metadata.passageName = story.name;
      }
      break;
    }

    case 'deleteStory': {
      metadata.action = 'delete_story';
      break;
    }

    case 'createPassage': {
      const story = findStory(newState, action.storyId);
      // Find newly created passage
      const prevStory = findStory(prevState, action.storyId);
      const newPassage = story?.passages.find(
        p => !prevStory?.passages.find(pp => pp.id === p.id)
      );
      metadata.action = 'create_passage';
      if (newPassage) {
        metadata.passageId = newPassage.id;
        metadata.passageName = newPassage.name;
      }
      break;
    }

    case 'createPassages': {
      metadata.action = 'create_passages';
      break;
    }

    case 'updatePassage': {
      const story = findStory(newState, action.storyId);
      const passage = findPassage(story, action.passageId);
      metadata.action = 'update_passage';
      if (passage) {
        metadata.passageId = passage.id;
        metadata.passageName = passage.name;
      }
      // Check if text was updated
      const prevStory = findStory(prevState, action.storyId);
      const prevPassage = findPassage(prevStory, action.passageId);
      if (prevPassage && passage && prevPassage.text !== passage.text) {
        metadata.oldValue = prevPassage.text;
        metadata.newValue = passage.text;
      }
      break;
    }

    case 'updatePassages': {
      metadata.action = 'update_passages';
      const passageIds = Object.keys(action.passageUpdates);
      if (passageIds.length === 1) {
        const story = findStory(newState, action.storyId);
        const passage = findPassage(story, passageIds[0]);
        if (passage) {
          metadata.passageId = passage.id;
          metadata.passageName = passage.name;
        }
      }
      break;
    }

    case 'deletePassage': {
      const prevStory = findStory(prevState, action.storyId);
      const deletedPassage = findPassage(prevStory, action.passageId);
      metadata.action = 'delete_passage';
      if (deletedPassage) {
        metadata.passageId = deletedPassage.id;
        metadata.passageName = deletedPassage.name;
      }
      break;
    }

    case 'deletePassages': {
      metadata.action = 'delete_passages';
      break;
    }
  }

  return metadata;
}

/**
 * Convert a Twine internal Story to the Ariadne TwineStory format
 * expected by the parent TwineIframeEditor.
 *
 * Twine uses left/top for position and stores startPassage as a passage ID.
 * Ariadne uses position: {x, y} and startPassage as a passage name.
 */
function convertToAriadneStory(story: Story): {
  name: string;
  startPassage: string;
  storyFormat: string;
  storyFormatVersion: string;
  passages: Array<{
    id: string;
    name: string;
    text: string;
    tags: string[];
    position: { x: number; y: number };
  }>;
} {
  // Resolve startPassage ID to passage name
  const startPassage = story.passages.find(p => p.id === story.startPassage);
  const startPassageName = startPassage?.name || 'Start';

  return {
    name: story.name,
    startPassage: startPassageName,
    storyFormat: story.storyFormat,
    storyFormatVersion: story.storyFormatVersion,
    passages: story.passages.map(p => ({
      id: p.id,
      name: p.name,
      text: p.text,
      tags: p.tags || [],
      position: { x: p.left, y: p.top },
    })),
  };
}

/**
 * Get full story data for the event
 */
function getStoryData(state: StoriesState, action: StoriesAction): Story | undefined {
  switch (action.type) {
    case 'createStory':
      // Find the newly created story
      return state[state.length - 1];
    case 'updateStory':
    case 'createPassage':
    case 'createPassages':
    case 'updatePassage':
    case 'updatePassages':
    case 'deletePassage':
    case 'deletePassages':
      return findStory(state, (action as any).storyId);
    case 'deleteStory':
      return undefined;
    default:
      return undefined;
  }
}

/**
 * Emit a Ariadne event for a state change
 */
export function emitStateChangeEvent(
  action: StoriesAction,
  prevState: StoriesState,
  newState: StoriesState
): void {
  // Only emit if bridge is active
  if (!isBridgeActive()) {
    return;
  }

  const eventType = mapActionToEventType(action.type);
  if (!eventType) {
    return;
  }

  const metadata = createEventMetadata(action, prevState, newState);
  const story = getStoryData(newState, action);

  const event: AriadneEventData = {
    type: eventType,
    timestamp: new Date().toISOString(),
    passageTitle: metadata.passageName,
    content: story ? JSON.stringify(story) : undefined,
    metadata
  };

  console.log('[Ariadne State] Emitting event:', event.type, metadata.action);
  emitEvent(event);

  // Also send the full story as twine:story-changed so the parent
  // can trigger autosave via TwineIframeEditor.onStoryChange
  if (story) {
    sendToParent({
      type: 'twine:story-changed',
      payload: convertToAriadneStory(story),
    });
  }
}

/**
 * Create a middleware that wraps the reducer to emit events
 */
export function createAriadneMiddleware<S extends StoriesState, A extends StoriesAction>(
  reducer: (state: S, action: A) => S
): (state: S, action: A) => S {
  return (state: S, action: A): S => {
    const newState = reducer(state, action);

    // Emit event for relevant actions
    try {
      emitStateChangeEvent(action, state, newState);
    } catch (error) {
      console.error('[Ariadne State] Error emitting event:', error);
    }

    return newState;
  };
}
