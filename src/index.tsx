import * as React from 'react';
import * as ReactDOM from 'react-dom';
import {App} from './app';
import './util/i18n';

// Initialize Ariadne integration (postMessage bridge, event emitters)
import './ariadne';

ReactDOM.render(
	<React.StrictMode>
		<App />
	</React.StrictMode>,
	document.getElementById('root')
);
