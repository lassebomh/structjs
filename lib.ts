function assert(value: any): asserts value {
  if (!value) {
    throw new Error("Assertion failed");
  }
}
function fail(msg?: string): never {
  throw new Error(msg ?? "Assertion failed");
}

export interface Type<T> {
  size: number;
  alignment: number;
  createView: () => BufferView<T>;
}

export interface BufferView<T> {
  bind: (buffer: ArrayBuffer, offset?: number) => void;
  /**
   * @description A view is
   */
  get: () => T;
  /**
   * @description A view is
   */
  set: (value: T) => void;
}

type ValueOf<T extends Type<any>> = T extends Type<infer R> ? R : never;

export const f32: Type<number> = {
  alignment: 4,
  size: 4,
  createView() {
    let dataView: DataView;
    return {
      bind(buffer, offset = 0) {
        dataView = new DataView(buffer, offset);
      },
      get: () => dataView.getFloat32(0, true),
      set: (value) => dataView.setFloat32(0, value, true),
    };
  },
};

export const u32: Type<number> = {
  alignment: 4,
  size: 4,
  createView() {
    let dataView: DataView;
    return {
      bind(buffer, offset = 0) {
        dataView = new DataView(buffer, offset);
      },
      get: () => dataView.getUint32(0, true),
      set: (value) => dataView.setUint32(0, value, true),
    };
  },
};

export const i32: Type<number> = {
  alignment: 4,
  size: 4,
  createView() {
    let dataView!: DataView;
    return {
      bind(buffer, offset = 0) {
        dataView = new DataView(buffer, offset);
      },
      get: () => dataView.getInt32(0, true),
      set: (value) => dataView.setInt32(0, value, true),
    };
  },
};

export function struct<T extends { [K in string]: Type<any> }>(fields: T): Type<{ [K in keyof T]: ValueOf<T[K]> }> {
  const fieldsNames = Object.keys(fields);
  const fieldsTypes = Object.values(fields);

  const alignment = Math.max(...fieldsTypes.map((f) => f.alignment));

  const fieldOffsets: Record<(typeof fieldsNames)[number], number> = {};

  let size: number;

  {
    let offset = 0;
    for (const fieldName in fields) {
      const fieldType = fields[fieldName];
      const padding = offset % fieldType.alignment;
      offset += padding;
      fieldOffsets[fieldName] = offset;
      offset += fieldType.size;
    }
    const padding = offset % alignment;
    offset += padding;
    size = offset;
  }
  return {
    alignment,
    size,
    createView() {
      let fieldViews: { [K in keyof T]: BufferView<T[K]> } = {} as any;

      for (const fieldName in fields) {
        const fieldType = fields[fieldName];
        fieldViews[fieldName] = fieldType.createView();
      }

      const proxy = new Proxy(
        {
          toJSON: () => {
            const obj: Record<any, any> = {};
            for (const fieldName in fields) {
              obj[fieldName] = fieldViews[fieldName].get();
            }
            return obj;
          },
        },
        {
          get(target, prop) {
            if (prop in target) {
              return target[prop as keyof typeof target];
            }
            assert(prop in fields);
            const fieldView = fieldViews[prop as keyof T];
            return fieldView.get();
          },
          set(target, prop, value) {
            assert(prop in fields);
            const fieldView = fieldViews[prop as keyof T];
            fieldView.set(value);
            return true;
          },
        }
      );

      return {
        bind(buffer, offset = 0) {
          for (const fieldName in fieldViews) {
            const fieldView = fieldViews[fieldName];
            const fieldOffset = fieldOffsets[fieldName];
            fieldView.bind(buffer, offset + fieldOffset);
          }
        },
        get: () => proxy as { [K in keyof T]: ValueOf<T[K]> },
        set(value) {
          for (const key in fields) {
            const fieldView = fieldViews[key];
            const newValue = value[key];
            fieldView.set(newValue);
          }
        },
      };
    },
  };
}

interface FixedArray<Len extends number, T> extends Iterable<T> {
  readonly length: Len;
  readonly toJSON: () => Array<T>;
  [x: number]: T;
}
interface Vector<Cap extends number, T> extends Iterable<T> {
  length: number;
  readonly capacity: Cap;
  readonly toJSON: () => Array<T>;
  [x: number]: T;
}

export function array<Len extends number, T extends Type<any>>(
  length: Len,
  type: T
): Type<FixedArray<Len, ValueOf<T>>> {
  const elementViews: BufferView<ValueOf<T>>[] = new Array(length);

  for (let i = 0; i < length; i++) {
    elementViews[i] = type.createView();
  }

  const proxy = new Proxy(
    {
      length: length,
      *[Symbol.iterator]() {
        for (const elementView of elementViews) {
          yield elementView.get();
        }
      },
      toJSON: () => [...proxy],
    },
    {
      get(target, prop) {
        if (prop in target) {
          return target[prop as keyof typeof target];
        }
        let index = Number(prop);
        assert(Number.isFinite(index));
        if (index < 0) index += length;
        assert(index >= -length && index < length);
        const elementValue = elementViews[index];
        return elementValue.get();
      },
      set(target, prop, value) {
        let index = Number(prop);
        assert(Number.isFinite(index));
        if (index < 0) index += length;
        assert(index >= -length && index < length);
        const elementValue = elementViews[index];
        elementValue.set(value);
        return true;
      },
      deleteProperty(target, prop) {
        fail("Cannot delete an element from an array");
      },
    }
  );

  return {
    alignment: type.size,
    size: length * type.size,
    createView() {
      return {
        bind(buffer, offset = 0) {
          for (let i = 0; i < elementViews.length; i++) {
            const elementValue = elementViews[i];
            elementValue.bind(buffer, offset + type.size * i);
          }
        },
        get: () => proxy,
        set: (value) => {
          for (let i = 0; i < length; i++) {
            const elementValue = elementViews[i];
            elementValue.set(value[i]);
          }
        },
      };
    },
  };
}
export function vector<Len extends number, T extends Type<any>>(capacity: Len, type: T): Type<Vector<Len, ValueOf<T>>> {
  const elementViews: BufferView<ValueOf<T>>[] = new Array(capacity);

  for (let i = 0; i < capacity; i++) {
    elementViews[i] = type.createView();
  }

  const lengthType = u32;
  const lengthView = lengthType.createView();

  let elementsBytes!: Uint8Array;

  const proxy = new Proxy(
    {
      length: 0, // placeholder
      capacity: capacity,
      *[Symbol.iterator]() {
        for (const elementView of elementViews.slice(0, lengthView.get())) {
          yield elementView.get();
        }
      },
      toJSON: () => [...proxy],
    },
    {
      get(target, prop) {
        if (prop === "length") {
          return lengthView.get();
        }
        if (prop in target) {
          return target[prop as keyof typeof target];
        }
        let index = Number(prop);
        assert(Number.isFinite(index));
        const length = lengthView.get();
        if (index < 0) index += length;
        assert(index >= -length && index < length);
        const elementValue = elementViews[index];
        return elementValue.get();
      },
      set(target, prop, value) {
        if (prop === "length") {
          assert(Number.isFinite(value));
          assert(value >= 0 && value <= capacity);
          const currentLength = lengthView.get();
          if (value < currentLength) {
            elementsBytes.fill(0, value * type.size, currentLength * type.size);
          }
          lengthView.set(value);
          return true;
        }
        let index = Number(prop);
        assert(Number.isFinite(index));
        const length = lengthView.get();
        if (index < 0) index += length;
        assert(index >= -length && index < length);
        const elementValue = elementViews[index];
        elementValue.set(value);
        return true;
      },
      deleteProperty(target, prop) {
        let index = Number(prop);
        assert(Number.isFinite(index));
        const length = lengthView.get();
        if (index < 0) index += length;
        assert(index >= -length && index < length);

        if (index !== length - 1) {
          elementsBytes.set(elementsBytes.slice((index + 1) * type.size, length * type.size), index * type.size);
        }

        elementsBytes.fill(0, (length - 1) * type.size, length * type.size);
        lengthView.set(length - 1);

        return true;
      },
    }
  );

  return {
    alignment: Math.max(lengthType.alignment, type.alignment),
    size: lengthType.size + type.size * capacity,
    createView() {
      return {
        bind(buffer, offset = 0) {
          lengthView.bind(buffer, offset);
          for (let i = 0; i < capacity; i++) {
            const elementView = elementViews[i];
            elementView.bind(buffer, offset + lengthType.size + type.size * i);
          }
          elementsBytes = new Uint8Array(buffer, offset + lengthType.size, type.size * capacity);
        },
        get: () => proxy,
        set: (value) => {
          for (let i = 0; i < capacity; i++) {
            const elementValue = elementViews[i];
            elementValue.set(value[i]);
          }
        },
      };
    },
  };
}

export function vec2(type: Type<number>) {
  return struct({
    x: type,
    y: type,
  });
}
export function vec3(type: Type<number>) {
  return struct({
    x: type,
    y: type,
    z: type,
  });
}
export function vec4(type: Type<number>) {
  return struct({
    x: type,
    y: type,
    z: type,
    w: type,
  });
}
