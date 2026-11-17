import { Game } from './core/game.js';

const game = new Game(document.getElementById('app'), document.getElementById('ui'));
game.init();
window.__game = game; // handy for debugging and automated playtests
