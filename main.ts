import { struct, array, f32, u32, i32 } from "./lib.ts";

const myStruct = struct({
  foo: struct({
    value: f32,
  }),
  bar: struct({
    value: u32,
  }),
  baz: array(5, i32),
});

const buffer = new ArrayBuffer(myStruct.size);
const value = myStruct.createView();
value.bind(buffer, 0);

const obj = value.get();

obj.foo.value = 1.23456789;

// console.log(structuredClone(obj));

obj.bar.value = 9;

// console.log(structuredClone(obj));

// obj.baz.x += 1;
// obj.baz.y += 2;
// obj.baz.z += 3;
// obj.baz.w += 4;

for (let i = 0; i < obj.baz.length; i++) {
  obj.baz[i] = i + 1;
}
for (const element of obj.baz) {
  console.log("->>", element);
}

console.log(buffer);

// value.set({ foo: 1.2, bar: 2, baz: -3 });
// console.log({ ...obj });
// console.log(buffer);
