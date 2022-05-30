import * as React from 'react';
import * as ReactDOM from 'react-dom';
import Game from './Game';
import registerServiceWorker from './registerServiceWorker';
import './index.css';

const gameData = require('./assets/game.json');

ReactDOM.render(
  <Game {...gameData} />,
  document.getElementById('root') as HTMLElement
);
registerServiceWorker();
