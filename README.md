Run example with `node --watch ./example.ts` (node v22+).

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

// Create a view for the type.
const playersView = Players.createView();

// `get` returns a proxy that will forward reads/writes to the buffer we'll bind later.
const players = playersView.get();

// Create a buffer. Has to at least be the size of the type.
const buffer = new ArrayBuffer(Players.size);

// Bind the view to the buffer. This will make the proxy usable.
playersView.bind(buffer);

for (const player of players) {
  player.position.x += 1;
}

const firstPlayer = players[0];

firstPlayer.position.x += 10;

firstPlayer.health = { max: 100, value: 100 };

// This will copy the firstPlayer to index 3, not override it with a duplicate reference.
players[3] = firstPlayer;

players[3].health.value += 123;

console.log(JSON.stringify(players, undefined, 2));

// We can also create another buffer, and bind the view to it.
// This time we'll create a buffer thats way larger than what we need.
const buffer2 = new ArrayBuffer(1000);

// And we'll bind it at an arbitrary offset
playersView.bind(buffer2, 103);

// All our original proxies still work, but now it will read/write to the new buffer at the provided offset.

players[2].health.max = 13;

firstPlayer.position.y = 10;

console.log(JSON.stringify(players, undefined, 2));
```
