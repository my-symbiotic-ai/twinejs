import * as React from 'react';
import {HashRouter, Route, Switch, useHistory} from 'react-router-dom';
import {usePrefsContext} from '../store/prefs';
import {useStoriesContext} from '../store/stories';
import {StoryEditRoute} from './story-edit';
import {StoryListRoute} from './story-list';
import {StoryPlayRoute} from './story-play';
import {StoryProofRoute} from './story-proof';
import {StoryTestRoute} from './story-test';
import {WelcomeRoute} from './welcome';

/**
 * Listens for ariadne:load-story custom events (dispatched by the Ariadne
 * postMessage bridge) and loads the story into the store, then navigates
 * to the story editor. Must be rendered inside HashRouter and StoriesContext.
 */
const AriadneStoryLoader: React.FC = () => {
	const history = useHistory();
	const {dispatch, stories} = useStoriesContext();

	React.useEffect(() => {
		const handler = (event: Event) => {
			const detail = (event as CustomEvent).detail;
			if (!detail) return;

			// The payload is an Ariadne-format story (from TwineIframeEditor)
			// with fields: name, startPassage, storyFormat, storyFormatVersion, passages[]
			// Each passage has: name, text, tags, position {x, y}

			// Convert Ariadne passages to Twine passage format
			const passages = (detail.passages || []).map(
				(p: {name: string; text: string; tags?: string[]; position?: {x: number; y: number}}, i: number) => ({
					name: p.name,
					text: p.text || '',
					tags: p.tags || [],
					left: p.position?.x ?? 100 + i * 200,
					top: p.position?.y ?? 100,
				})
			);

			// Use a deterministic ID based on the story name so reloads
			// update the same story rather than creating duplicates
			const storyId = detail.id || `ariadne-${detail.name?.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) || 'story'}`;

			const existing = stories.find(s => s.id === storyId);

			if (existing) {
				// Update existing story
				dispatch({
					type: 'updateStory',
					storyId,
					props: {
						name: detail.name || existing.name,
						storyFormat: detail.storyFormat || existing.storyFormat,
						storyFormatVersion: detail.storyFormatVersion || existing.storyFormatVersion,
						startPassage: '', // Will be resolved by passage name below
						passages,
						lastUpdate: new Date(),
					}
				});

				// Set startPassage to the ID of the matching passage
				const startName = detail.startPassage || 'Start';
				const updatedStory = stories.find(s => s.id === storyId);
				if (updatedStory) {
					const startP = updatedStory.passages.find(p => p.name === startName);
					if (startP) {
						dispatch({
							type: 'updateStory',
							storyId,
							props: {startPassage: startP.id}
						});
					}
				}
			} else {
				// Create new story
				dispatch({
					type: 'createStory',
					props: {
						id: storyId,
						name: detail.name || 'Untitled Story',
						storyFormat: detail.storyFormat || 'Harlowe',
						storyFormatVersion: detail.storyFormatVersion || '3.3.9',
						passages,
					}
				});
			}

			// Navigate to the story editor
			// Use a small delay to let the store update propagate
			setTimeout(() => {
				history.push(`/stories/${storyId}`);
			}, 50);
		};

		window.addEventListener('ariadne:load-story', handler);
		return () => window.removeEventListener('ariadne:load-story', handler);
	}, [dispatch, stories, history]);

	return null;
};

export const Routes: React.FC = () => {
	const {prefs} = usePrefsContext();

	// A <HashRouter> is used to make our lives easier--to load local story
	// formats, we need the document HREF to reflect where the HTML file is.
	// Otherwise we'd have to store the actual location somewhere, which will
	// differ between web and Electron contexts.

	return (
		<HashRouter>
			<AriadneStoryLoader />
			{prefs.welcomeSeen ? (
				<Switch>
					<Route exact path="/">
						<StoryListRoute />
					</Route>
					<Route path="/welcome">
						<WelcomeRoute />
					</Route>
					<Route path="/stories/:storyId/play">
						<StoryPlayRoute />
					</Route>
					<Route path="/stories/:storyId/proof">
						<StoryProofRoute />
					</Route>
					<Route path="/stories/:storyId/test/:passageId">
						<StoryTestRoute />
					</Route>
					<Route path="/stories/:storyId/test">
						<StoryTestRoute />
					</Route>
					<Route path="/stories/:storyId">
						<StoryEditRoute />
					</Route>
					<Route
						path="*"
						render={path => {
							console.warn(
								`No route for path "${path.location.pathname}", rendering story list`
							);
							return <StoryListRoute />;
						}}
					></Route>
				</Switch>
			) : (
				<WelcomeRoute />
			)}
		</HashRouter>
	);
};
