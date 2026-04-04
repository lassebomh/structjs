import { struct, vector, u32 } from "./lib.ts";

const Inputs = vector(3, struct({ value: u32 }));

const inputsView = Inputs.createView();
const inputs = inputsView.get();

const buffer = new ArrayBuffer(Inputs.size);

inputsView.bind(buffer);

inputs.length = inputs.capacity;

for (let i = 0; i < inputs.length; i++) {
  inputs[i].value = 0x11111111 * (i + 1);
}

inputs[1] = inputs[-1];
inputs.length--;

console.log(JSON.stringify(inputs));
console.log(buffer);
