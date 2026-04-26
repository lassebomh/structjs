import { struct, vector, u32 } from "../lib.ts";

const Inputs = vector(4, struct({ value: u32 }));

const inputsView = Inputs.createView();
const inputs = inputsView.get();

const buffer = new ArrayBuffer(Inputs.size);

inputsView.bind(buffer);

inputs.length = inputs.capacity;

for (let i = 0; i < inputs.length; i++) {
  inputs[i].value = 0xff;
}

// swap and pop
inputs[2] = inputs[-1];
inputs.length--;

console.log(JSON.stringify(inputs));
console.log(buffer);
