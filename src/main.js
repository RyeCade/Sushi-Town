import { Game } from './Game.js';

const game = new Game();

async function init() {
  await game.init();
  
  let lastTime = performance.now();
  
  function gameLoop(currentTime) {
    const deltaTime = Math.min((currentTime - lastTime) / 1000, 0.1);
    lastTime = currentTime;
    
    game.update(deltaTime);
    game.render();
    
    requestAnimationFrame(gameLoop);
  }
  
  requestAnimationFrame(gameLoop);
}

init();