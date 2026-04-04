import { struct, vector, bool } from "./lib.ts";

const Inputs = vector(
  3,
  struct({
    a: bool,
    b: bool,
  })
);

const inputsView = Inputs.createView();
const inputs = inputsView.get();

const buffer = new ArrayBuffer(Inputs.size);

inputsView.bind(buffer, 0);

inputs.length = inputs.capacity;

for (const input of inputs) {
  input.a = true;
  input.b = true;
}

console.log(JSON.stringify(inputs));
console.log(buffer);
