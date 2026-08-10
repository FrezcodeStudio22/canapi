let reactivityPromise = null;

export function getReactiveAdapter() {
  if (!reactivityPromise) {
    reactivityPromise = import('@decaspace/can-framework')
      .then((mod) => mod.default || mod)
      .then((mod) => {
        const ref = (mod.ref && typeof mod.ref === 'function' ? mod.ref : null) || fallbackRef;
        const plain = mod.reactive && typeof mod.reactive === 'function' ? mod.reactive : null;
        return { available: true, ref, reactive: plain, markRaw: mod.markRaw || ((v) => v) };
      })
      .catch(() => ({ available: false, ref: fallbackRef, reactive: null, markRaw: (v) => v }));
  }
  return reactivityPromise;
}

function fallbackRef(value) {
  return { value, __canapiFallback: true };
}

export async function ref(value) {
  const adapter = await getReactiveAdapter();
  return adapter.ref(value);
}

export function makeRef(value) {
  const holder = fallbackRef(value);
  getReactiveAdapter().then((adapter) => {
    const realRef = adapter.ref(holder.value);
    holder.value = realRef.value;
    Object.defineProperty(holder, 'value', {
      get() {
        return realRef.value;
      },
      set(v) {
        realRef.value = v;
      },
      enumerable: true,
      configurable: true,
    });
    holder.__canapiRef = realRef;
  });
  return holder;
}