import { f32, flags, struct, u32 } from "./lib.ts";

// flags
// enum

const Input = struct({
  tick: u32,
  key: u32,
  test: flags("1", "2", "3", "4", "5", "6", "7", "8", "21", "22", "23", "24", "25", "26", "27", "28"),
  value: f32,
});

const inputView = Input.createView();

const buffer = new ArrayBuffer(Input.size);
inputView.bind(buffer);

const input = inputView.get();

console.log(JSON.stringify(input));

const v = performance.timeOrigin + performance.now();

console.log(buffer);

// input.time = v;
