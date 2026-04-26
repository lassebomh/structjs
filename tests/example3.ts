import { union, u32, struct, f32 } from "../lib.ts";

const Result = union({ error: u32, value: struct({ foo: u32, bar: u32 }) });

const resultView = Result.createView();
const result = resultView.get();

const buffer = new ArrayBuffer(Result.size);

resultView.bind(buffer);

result.value = { bar: 1, foo: 21 };

console.log(result.value);

console.log(JSON.stringify(result));
console.log(buffer);

const MessageHeader = struct({
  from: u32,
  to: u32,
  data: union({
    foo: u32,
    baz: f32,
  }),
});

const messageHeaderView = MessageHeader.createView();
const messageHeader = messageHeaderView.get();
