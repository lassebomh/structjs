function assert(value: any): asserts value {
  if (!value) {
    throw new Error("Assertion failed");
  }
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

interface FixedArray<L extends number, T> extends Iterable<T> {
  readonly length: L;
  readonly toJSON: () => Array<T>;
  [x: number]: T;
}

export function array<L extends number, T extends Type<any>>(length: L, type: T): Type<FixedArray<L, ValueOf<T>>> {
  const elementValues: BufferView<ValueOf<T>>[] = new Array(length);

  for (let i = 0; i < length; i++) {
    elementValues[i] = type.createView();
  }

  const proxy = new Proxy(
    {
      length: length,
      *[Symbol.iterator]() {
        for (let i = 0; i < elementValues.length; i++) {
          const elementValue = elementValues[i];
          yield elementValue.get();
        }
      },
      toJSON: () => [...proxy],
    },
    {
      get(target, prop) {
        if (prop in target) {
          return target[prop as keyof typeof target];
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

  return {
    alignment: type.size,
    size: length * type.size,
    createView() {
      return {
        bind(buffer, offset = 0) {
          for (let i = 0; i < elementValues.length; i++) {
            const elementValue = elementValues[i];
            elementValue.bind(buffer, offset + type.size * i);
          }
        },
        get: () => proxy as FixedArray<L, ValueOf<T>>,
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
