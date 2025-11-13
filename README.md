## 📦 `koinish`

A minimalist, **Koin-like Dependency Injection (DI)** library for **TypeScript / JavaScript** — designed for developers
who dislike decorators and prefer clean, explicit dependency graphs.

> ⚠️⚠️ Hmm, the package was interesting, but unfortunately TypeScript has limitations regarding
> typing because it doesn't exist at runtime, so it doesn't allow for the full use of the idea.
> So I'll stop here. So I'll stop here. ⚠️⚠️

[![Coverage Status](https://coveralls.io/repos/github/HarukaYamamoto0/koinish/badge.svg?branch=main)](https://coveralls.io/github/HarukaYamamoto0/koinish?branch=main)

### 🧠 Philosophy

Koinish takes inspiration from Kotlin’s [Koin](https://insert-koin.io/) but re-imagines it for the JS/TS ecosystem:

* ✅ **No decorators required**
* ✅ **Optional** `reflect-metadata` support for constructor auto-injection
* ✅ **Factories, singletons, and scoped lifetimes**
* ✅ **Manual `deps` injection** or **DSL-style `get()`** inside factories
* ✅ **Async factories** for connections or remote resources
* ✅ **Graceful lifecycle management** (`onClose`, `.close()`, `.dispose()`, `.destroy()`)
* ✅ **Scoped containers** for per-request, per-job, or per-transaction isolation
* ✅ **Koin-style syntax**, pure TypeScript ergonomics

## 🚀 Installation

```bash
npm install koinish
# or
bun add koinish
# or
pnpm add koinish
```

> ⚙️ `reflect-metadata` is optional.
> If you want automatic constructor injection, install and import it manually:

```bash
bun i reflect-metadata
```

```ts
// at your application entrypoint
import 'reflect-metadata';
```

## 🧩 Quick Start

```ts
import {
  module, singleOf, factoryOf, scopedOf,
  startDI, inject, beginScope, shutdownDI
} from 'koinish';

class Repo {
  list() { return ['item1', 'item2']; }
}

class Service {
  constructor(public repo: Repo) {}
  ping() { return 'pong'; }
}

class Controller {
  constructor(public service: Service) {}
}

// Declare your module:
const appModule = module(
  singleOf(Repo),
  singleOf(Service, { deps: [Repo] }), // or rely on reflect metadata if available
  factoryOf(Controller, ({ get }) => new Controller(get(Service))),
);

// Start DI
startDI(appModule);

// Retrieve instances
const controller = inject(Controller);
console.log(controller.service.ping()); // → "pong"

// Gracefully shut down
await shutdownDI();
```

## ⚙️ Lifecycles

Each provider type has its own lifetime:

| Function      | Lifetime                    | Cached | Disposed via `shutdownDI()` / `end()` |
|---------------|-----------------------------|--------|---------------------------------------|
| `singleOf()`  | Singleton                   | ✅      | ✅                                     |
| `factoryOf()` | Factory                     | ❌      | ❌                                     |
| `scopedOf()`  | Scoped (per-`beginScope()`) | ✅      | ✅                                     |

### Example: Graceful shutdown and cleanup

```ts
class Database {
  async connect() { /* ... */ }
  async close() { console.log('DB closed'); }
}

const dbModule = module(
  singleOf(Database, async () => {
    const db = new Database();
    await db.connect();
    return db;
  })
);

startDI(dbModule);
inject(Database);
await shutdownDI(); // calls .close(), .dispose(), .destroy() or onClose callback
```

You can also register a manual callback:

```ts
singleOf(Cache, { onClose: (instance) => instance.flush() });
```

## 🧭 Scopes

Scopes let you isolate instances (e.g., per request in an API server).

```ts
class RequestCtx { constructor(public id = Math.random()) {} }

const scopedModule = module(scopedOf(RequestCtx));
startDI(scopedModule);

// Create two scopes
const request1 = beginScope();
const request2 = beginScope();

const ctxA = request1.get(RequestCtx);
const ctxB = request2.get(RequestCtx);

console.log(ctxA === request1.get(RequestCtx)); // true (same scope)
console.log(ctxA === ctxB);                     // false (different scopes)

// Cleanup each scope individually
await request1.end(); // calls dispose/close/onClose
await request2.end();
```

## ⚡ Async Factories

Factories and singles can be async — ideal for database or network setup.

```ts
class Connection { constructor(public url: string) {} }
class Repository { constructor(public conn: Connection) {} }

const asyncModule = module(
  singleOf(Connection, async () => new Connection('sqlite://memory')),
  singleOf(Repository, async ({ getAsync }) => new Repository(await getAsync(Connection))),
);

startDI(asyncModule);

const repo = await injectAsync(Repository);
console.log(repo.conn.url); // → sqlite://memory
```

## 🧱 Dependency Resolution

### Using `deps` (no reflect-metadata required)

```ts
singleOf(Service, { deps: [Repo] });
```

### Using a factory with `get()`

```ts
singleOf(Service, ({ get }) => new Service(get(Repo)));
```

### Using constructor metadata (optional)

```ts
// if reflect-metadata is imported and TS emits design:paramtypes
singleOf(Service);
```

## 🔁 Overrides & Modules

### Combining modules

```ts
const baseModule = module(singleOf(Repo));
const serviceModule = module(singleOf(Service, { deps: [Repo] }));

startDI(modules(baseModule, serviceModule));
```

### Duplicate providers → error by default

```ts
const A = module(singleOf(Service, () => new Impl1()));
const B = module(singleOf(Service, () => new Impl2()));

startDI(A, B); // ❌ BeanOverrideError
```

### Allow overrides

```ts
startDI(A, B, { allowOverride: true, overrideStrategy: 'lastWins' });
const svc = inject(Service); // → Impl2
```

### Manual runtime override

```ts
override(Service, new MockService());
```

## 🧹 Shutdown Behavior

When you call `shutdownDI()`, Koinish:

1. Calls each provider’s `onClose(instance)` if present
2. Otherwise, looks for `.dispose()`, `.close()`, or `.destroy()` methods
3. Runs in reverse order of creation
4. Clears caches afterward

## 🧠 Auto-Injection Notes

Koinish does **not require** decorators or `reflect-metadata`, but if both are present:

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true
  }
}
```

Then, with:

```ts
import 'reflect-metadata';
singleOf(Service);
```

the DI container will automatically read `design:paramtypes` and inject dependencies by constructor type.

## 🧪 Testing

You can run both test suites (with and without `reflect-metadata`):

```bash
bun test
```

### Structure

```sh
tests/
├── no-reflect.spec.ts    // covers manual deps, lifecycle, scopes, overrides
└── reflect.spec.ts       // covers auto-injection with reflect-metadata
```

Example test snippet:

```ts
it('singleOf returns the same instance', () => {
  const m = module(singleOf(Repo));
  startDI(m);
  const r1 = inject(Repo);
  const r2 = inject(Repo);
  expect(r1).toBe(r2);
});
```

## 🧾 License

This project is licensed under the Apache License 2.0. See the [LICENSE](LICENSE) file for more details.

## 💡 Why “Koinish”?

Because it’s **Koin-ish** — familiar to Kotlin developers,
but made for **JavaScript ergonomics**: explicit, reflective-optional, and lightweight.
