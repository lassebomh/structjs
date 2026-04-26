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

export type ValueOf<T extends Type<any>> = T extends Type<infer R> ? R : never;

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

export const f64: Type<number> = {
  alignment: 8,
  size: 8,
  createView() {
    let dataView: DataView;
    return {
      bind(buffer, offset = 0) {
        dataView = new DataView(buffer, offset);
      },
      get: () => dataView.getFloat64(0, true),
      set: (value) => dataView.setFloat64(0, value, true),
    };
  },
};

export const bool: Type<boolean> = {
  alignment: 1,
  size: 1,
  createView() {
    let dataView!: DataView;
    return {
      bind(buffer, offset = 0) {
        dataView = new DataView(buffer, offset);
      },
      get: () => dataView.getInt8(0) !== 0,
      set: (value) => dataView.setInt8(0, value ? 0xff : 0x00),
    };
  },
};

export function flags<const T extends string>(...flags: T[]): Type<{ [K in T]: boolean }> {
  const size = Math.ceil(flags.length / 32) * 4;
  const alignment = size;

  return {
    alignment,
    size,
    createView() {
      const obj = {} as Record<T, boolean>;

      let values!: Uint8Array;

      Object.defineProperty(obj, "toJSON", {
        configurable: false,
        enumerable: false,
        value: () => ({ ...obj }),
      });

      for (let i = 0; i < flags.length; i++) {
        const flag = flags[i];

        const byte = Math.floor(i / 8);

        const bit = 1 << (i % 8);
        const mask = 0xff ^ bit;

        console.log(flag, i, mask.toString(2), bit.toString(2), byte);

        Object.defineProperty(obj, flag, {
          configurable: false,
          enumerable: true,
          get() {
            return (values[byte] & bit) != 0;
          },
          set(value) {
            let newByte = values[byte] & mask;
            if (value) newByte ||= bit;
            values[byte] = newByte;
          },
        });
      }

      return {
        bind(buffer, offset) {
          values = new Uint8Array(buffer, offset, size);
        },
        get() {
          return obj;
        },
        set(value) {
          for (const key in value) {
            obj[key] = value[key];
          }
        },
      };
    },
  };
}

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

      const obj = {} as { [K in keyof T]: ValueOf<T[K]> };

      Object.defineProperty(obj, "toJSON", {
        configurable: false,
        writable: false,
        enumerable: false,
        value: () => ({ ...obj }),
      });

      for (const fieldName in fields) {
        const fieldView = fieldViews[fieldName];

        Object.defineProperty(obj, fieldName, {
          configurable: false,
          enumerable: true,
          get: fieldView.get,
          set: fieldView.set,
        });
      }

      Object.seal(obj);

      return {
        bind(buffer, offset = 0) {
          for (const fieldName in fieldViews) {
            const fieldView = fieldViews[fieldName];
            const fieldOffset = fieldOffsets[fieldName];
            fieldView.bind(buffer, offset + fieldOffset);
          }
        },
        get: () => obj,
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
  [x: number]: T;
}
interface Vector<Cap extends number, T> extends Iterable<T> {
  length: number;
  readonly capacity: Cap;
  [x: number]: T;
}

export function array<Len extends number, T extends Type<any>>(
  length: Len,
  type: T,
): Type<FixedArray<Len, ValueOf<T>>> {
  return {
    alignment: type.size,
    size: length * type.size,
    createView() {
      const elementViews: BufferView<ValueOf<T>>[] = new Array(length);

      for (let i = 0; i < length; i++) {
        elementViews[i] = type.createView();
      }

      const obj = {} as FixedArray<Len, ValueOf<T>>;

      Object.defineProperties(obj, {
        length: {
          configurable: false,
          enumerable: false,
          writable: false,
          value: length,
        },
        toJSON: {
          configurable: false,
          enumerable: false,
          writable: false,
          value: () => [...obj],
        },
        [Symbol.iterator]: {
          configurable: false,
          enumerable: false,
          writable: false,
          value: function* () {
            for (const elementView of elementViews) {
              yield elementView.get();
            }
          },
        },
      });

      for (let i = 0; i < length; i++) {
        const elementView = elementViews[i];

        Object.defineProperty(obj, i, {
          configurable: false,
          enumerable: true,
          get: elementView.get,
          set: elementView.set,
        });

        if (i > 0) {
          const negativeElementView = elementViews[length - i];
          Object.defineProperty(obj, -i, {
            configurable: false,
            enumerable: false,
            get: negativeElementView.get,
            set: negativeElementView.set,
          });
        }
      }

      Object.seal(obj);
      return {
        bind(buffer, offset = 0) {
          for (let i = 0; i < elementViews.length; i++) {
            const elementValue = elementViews[i];
            elementValue.bind(buffer, offset + type.size * i);
          }
        },
        get: () => obj,
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
  const lengthType = u32;

  return {
    alignment: Math.max(lengthType.alignment, type.alignment),
    size: lengthType.size + type.size * capacity,
    createView() {
      const elementViews: BufferView<ValueOf<T>>[] = new Array(capacity);

      for (let i = 0; i < capacity; i++) {
        elementViews[i] = type.createView();
      }

      const lengthView = lengthType.createView();

      let elementsBytes!: Uint8Array;

      const obj = {} as Vector<Len, ValueOf<T>>;

      Object.defineProperties(obj, {
        capacity: {
          configurable: false,
          enumerable: false,
          writable: false,
          value: capacity,
        },
        length: {
          configurable: false,
          enumerable: false,
          get: lengthView.get,
          set(value) {
            if (!(Number.isFinite(value) && value >= 0 && value <= capacity)) {
              fail(`Tried updating length to ${value} which is not between [0, ${capacity}]`);
            }
            const length = lengthView.get();
            if (value < length) {
              elementsBytes.fill(0, value * type.size, length * type.size);
            }
            lengthView.set(value);
          },
        },
        toJSON: {
          configurable: false,
          enumerable: false,
          writable: false,
          value: () => [...obj],
        },
        [Symbol.iterator]: {
          configurable: false,
          enumerable: false,
          writable: false,
          value: function* () {
            for (const elementView of elementViews.slice(0, lengthView.get())) {
              yield elementView.get();
            }
          },
        },
      });

      for (let i = 0; i < capacity; i++) {
        const elementView = elementViews[i];

        Object.defineProperty(obj, i, {
          configurable: false,
          enumerable: true,
          get() {
            const length = lengthView.get();
            if (!(i < length)) {
              fail(`Index out of bounds (index=${i}, length=${length})`);
            }
            return elementView.get();
          },
          set(value) {
            const length = lengthView.get();
            if (!(i < length)) {
              fail(`Update index out of bounds (index=${i}, length=${length})`);
            }
            elementView.set(value);
          },
        });

        const ni = -(i + 1);

        Object.defineProperty(obj, ni, {
          configurable: false,
          enumerable: false,
          get() {
            const length = lengthView.get();
            if (length + ni < 0) {
              fail(`Index out of bounds (index=${ni}, length=${length})`);
            }
            return elementViews[length + ni].get();
          },
          set(value) {
            const length = lengthView.get();
            if (length + ni < 0) {
              fail(`Update index out of bounds (index=${ni}, length=${length})`);
            }
            return elementViews[length + ni].set(value);
          },
        });
      }

      Object.seal(obj);
      return {
        bind(buffer, offset = 0) {
          lengthView.bind(buffer, offset);
          for (let i = 0; i < capacity; i++) {
            const elementView = elementViews[i];
            elementView.bind(buffer, offset + lengthType.size + type.size * i);
          }
          elementsBytes = new Uint8Array(buffer, offset + lengthType.size, type.size * capacity);
        },
        get: () => obj,
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

type DiscriminatedUnion<T> = {
  [K in keyof T]: { [P in K]: T[K] } & { [P in Exclude<keyof T, K>]: undefined };
}[keyof T];

export function union<T extends { [K in string]: Type<any> }>(
  variants: T,
): Type<DiscriminatedUnion<{ [K in keyof T]: ValueOf<T[K]> }>> {
  const tagType = u32;

  const variantsNames = Object.keys(variants);
  const variantsTypes = Object.values(variants);

  const variantSize = Math.max(...variantsTypes.map((f) => f.size));
  const alignment = Math.max(...variantsTypes.map((f) => f.alignment));

  return {
    alignment,
    size: tagType.size + variantSize,
    createView() {
      const tagView = tagType.createView();
      let variantBytes!: Uint8Array;

      let variantViews: { [K in keyof T]: BufferView<T[K]> } = {} as any;

      for (const variantName in variants) {
        const variantType = variants[variantName];
        variantViews[variantName] = variantType.createView();
      }

      const obj = {} as DiscriminatedUnion<{ [K in keyof T]: ValueOf<T[K]> }>;

      Object.defineProperty(obj, "toJSON", {
        configurable: false,
        writable: false,
        enumerable: false,
        value: () => ({ ...obj }),
      });

      for (let i = 0; i < variantsNames.length; i++) {
        const variantName = variantsNames[i];
        const variantView = variantViews[variantName];

        Object.defineProperty(obj, variantName, {
          configurable: false,
          enumerable: true,
          get: () => {
            if (tagView.get() === i) {
              return variantView.get();
            } else {
              return undefined;
            }
          },
          set: (newValue) => {
            tagView.set(i);
            variantBytes.fill(0);
            variantView.set(newValue);
          },
        });
      }

      Object.seal(obj);

      return {
        bind(buffer, offset = 0) {
          tagView.bind(buffer, offset);
          variantBytes = new Uint8Array(buffer, offset + tagType.size, variantSize);
          for (const variantName in variantViews) {
            const variantView = variantViews[variantName];
            variantView.bind(buffer, offset + tagType.size);
          }
        },
        get: () => obj,
        set(value) {
          variantBytes.fill(0);
          for (let i = 0; i < variantsNames.length; i++) {
            const variantName = variantsNames[i];
            const variantValue = value[variantName];
            if (variantValue === undefined) continue;
            tagView.set(i);
            const variantView = variantViews[variantName];
            variantView.set(variantValue);
          }
        },
      };
    },
  };
}
