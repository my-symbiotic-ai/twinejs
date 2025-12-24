import * as React from 'react';
import useThunkReducer from 'react-hook-thunk-reducer';
import {usePersistence} from '../persistence/use-persistence';
import {reducer} from './reducer';
import {
	StoriesContextProps,
	StoriesAction,
	StoriesState
} from './stories.types';
import {useStoryFormatsContext} from '../story-formats';
import {useStoreErrorReporter} from '../use-store-error-reporter';
import {emitStateChangeEvent} from '../../ariadne/state-integration';

export const StoriesContext = React.createContext<StoriesContextProps>({
	dispatch: () => {},
	stories: []
});

StoriesContext.displayName = 'Stories';

export const useStoriesContext = () => React.useContext(StoriesContext);

export const StoriesContextProvider: React.FC = props => {
	const {stories: storiesPersistence} = usePersistence();
	const {formats} = useStoryFormatsContext();
	const {reportError} = useStoreErrorReporter();
	const persistedReducer: React.Reducer<
		StoriesState,
		StoriesAction
	> = React.useMemo(
		() => (state, action) => {
			const newState = reducer(state, action);

			try {
				storiesPersistence.saveMiddleware(newState, action, formats);
			} catch (error) {
				reportError(error as Error, 'store.errors.cantPersistStories');
			}

			// Emit Ariadne events for state changes (only when embedded)
			try {
				emitStateChangeEvent(action, state, newState);
			} catch (error) {
				console.error('[Ariadne] Error emitting state change event:', error);
			}

			return newState;
		},
		[formats, reportError, storiesPersistence]
	);
	const [stories, dispatch] = useThunkReducer(persistedReducer, []);

	return (
		<StoriesContext.Provider value={{dispatch, stories}}>
			{props.children}
		</StoriesContext.Provider>
	);
};
