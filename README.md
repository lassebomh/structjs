Binary format is compatible with WebGPU.

```ts
import { struct, array, f32, u32, vec2 } from "./lib.ts";

const Health = struct({
  value: u32,
  max: u32,
});

const Player = struct({
  position: vec2(f32),
  health: Health,
});

const Players = array(4, Player);

// Create a buffer. Has to be at least be the size of the type.
const buffer = new ArrayBuffer(Players.size);

// Create a view for the type and bind it to the buffer.
const playersView = Players.createView();

playersView.bind(buffer);

// `get` returns a object that will forward reads/writes to the buffer.
const players = playersView.get();

for (const player of players) {
  player.position.x += 1;
}

const firstPlayer = players[0];

firstPlayer.position.x += 10;

firstPlayer.health = { max: 100, value: 100 };

// This will copy the firstPlayer to index 3.
// This is different from the usual JS behavior where
// the same object reference will be duplicated into both indicies.
players[3] = firstPlayer;

players[3].health.value += 123;

console.log(JSON.stringify(players, undefined, 2));
```
