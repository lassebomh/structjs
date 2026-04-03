function assert(value: any): asserts value {
  if (!value) {
    throw new Error("Assertion failed");
  }
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
      let fieldViews: { [K in keyof T]: ValueView<T[K]> } = {} as any;

      for (const fieldName in fields) {
        const fieldType = fields[fieldName];
        fieldViews[fieldName] = fieldType.createView();
      }

      const fieldValues: { [K in keyof T]: ValueOf<T[K]> } = {} as any;

      for (const fieldName in fields) {
        const fieldView = fieldViews[fieldName];

        Object.defineProperty(fieldValues, fieldName, {
          get() {
            return fieldView.get();
          },
          set(value) {
            fieldView.set(value);
          },
          configurable: true,
          enumerable: true,
        });
      }

      return {
        bind(buffer, offset) {
          for (const fieldName in fieldViews) {
            const fieldView = fieldViews[fieldName];
            const fieldOffset = fieldOffsets[fieldName];
            fieldView.bind(buffer, offset + fieldOffset);
          }
        },
        get() {
          return fieldValues;
        },
        set(value) {
          assert(fieldViews);
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

type TypeArray<T extends Type<any>> = Type<{ [K in number]: ValueOf<T> } & { length: number } & Iterable<ValueOf<T>>>;

export function array<T extends Type<any>>(length: number, type: T): TypeArray<T> {
  const elementValues: ValueView<ValueOf<T>>[] = new Array(length);

  for (let i = 0; i < length; i++) {
    elementValues[i] = type.createView();
  }

  const proxy = new Proxy(
    {},
    {
      get(target, prop) {
        if (prop === "length") {
          return length;
        }
        if (prop === Symbol.iterator) {
          return function* () {
            for (let i = 0; i < elementValues.length; i++) {
              const elementValue = elementValues[i];
              yield elementValue.get();
            }
            return;
          };
        }
        const index = Number(prop);
        assert(Number.isFinite(index) && index >= 0 && index < length);
        const elementValue = elementValues[index];
        return elementValue.get();
      },
      set(target, prop, value) {
        const index = Number(prop);
        assert(Number.isFinite(index) && index >= 0 && index < length);
        const elementValue = elementValues[index];
        elementValue.set(value);
        return true;
      },
    }
  );

  console.log(length, type.size);

  return {
    alignment: type.size,
    size: length * type.size,
    createView() {
      return {
        bind(buffer, offset) {
          for (let i = 0; i < elementValues.length; i++) {
            const elementValue = elementValues[i];
            elementValue.bind(buffer, offset + type.size * i);
          }
        },

        get: () => proxy as ValueOf<TypeArray<T>>,
        set: (value) => {
          for (let i = 0; i < length; i++) {
            const elementValue = elementValues[i];
            elementValue.set(value[i]);
          }
        },
      };
    },
  };
}

export const f32: Type<number> = {
  alignment: 4,
  size: 4,
  createView() {
    let dataView: DataView;
    return {
      bind(buffer, offset) {
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
      bind(buffer, offset) {
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
      bind(buffer, offset) {
        dataView = new DataView(buffer, offset);
      },
      get: () => dataView.getInt32(0, true),
      set: (value) => dataView.setInt32(0, value, true),
    };
  },
};

export type f32 = Type<number>;
export type u32 = Type<number>;
export type i32 = Type<number>;

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

export interface Type<T> {
  size: number;
  alignment: number;
  createView: () => ValueView<T>;
}

interface ValueView<T> {
  bind: (buffer: ArrayBuffer, offset: number) => void;
  get: () => T;
  set: (value: T) => void;
}

export type ValueOf<T extends Type<any>> = T extends Type<infer R> ? R : never;
