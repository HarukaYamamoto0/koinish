/**
 * A generic type for representing a class constructor in TypeScript.
 *
 * @template T The type of the instance that the constructor creates.
 */
export type Ctor<T> = new (...args: any[]) => T;

/**
 * A generic type `Id` that serves as an alias for the `Ctor<T>` type.
 * It represents a constructor type that can be used to create or represent specific instances of a type.
 *
 * @template T - The type parameter that specifies the type for which the constructor applies.
 */
export type Id<T> = Ctor<T>;

/**
 * A TypeScript type that defines the various kinds of scopes used for dependency injection or object creation.
 *
 * The `ScopeKind` type can take one of the following string literal values:
 * - `'single'`: Indicates a single instance shared across all usages.
 * - `'factory'`: Indicates a new instance is created each time it is invoked.
 * - `'scoped'`: Indicates an instance is shared within a specific context or scope.
 */
export type ScopeKind = 'single' | 'factory' | 'scoped';

/**
 * A type definition for `Qualifier`.
 *
 * The `Qualifier` type is a union type that represents a value which can either be a string
 * or a symbol. This is typically used for scenarios where qualified identifiers are needed,
 * such as keys in maps or unique tokens for dependency injection or metadata annotations.
 *
 * Example of common usage includes:
 * - Using strings as keys or names for identification.
 * - Using symbols to create unique and immutable keys that avoid naming collisions.
 */
export type Qualifier = string | symbol;

/**
 * Represents an error that is thrown when a provider override is detected.
 * This error is specifically used to indicate that there is an attempt to
 * override an existing dependency or provider identified by a unique key.
 */
export class BeanOverrideError extends Error {
    constructor(public key: string) {
        super(`Provider override detected for ${key}`);
        this.name = 'BeanOverrideError';
    }
}

type FactoryCtx = {
    get: <U>(id: Id<U>, q?: Qualifier) => U;
    getAsync: <U>(id: Id<U>, q?: Qualifier) => Promise<U>;
};

type Factory<T> = (ctx: FactoryCtx) => T | Promise<T>;

type OnClose<T> = (instance: T) => void | Promise<void>;

/**
 * Represents a provider configuration that defines how a dependency can be created, resolved, and managed in a dependency injection system.
 *
 * @template T - The type of the value or instance provided by this configuration.
 *
 * @property {ScopeKind} kind - The scope kind indicating the lifecycle scope of the provider (e.g., singleton, transient).
 * @property {Id<T>} id - A unique identifier used to reference and resolve the provider's value or instance.
 * @property {Qualifier} [qualifier] - An optional qualifier that can be used to distinguish between similarly typed providers.
 * @property {Ctor<T>} [useClass] - A constructor to instantiate a class as the provided value (requires dependencies to be injected).
 * @property {Factory<T>} [useFactory] - A factory function to dynamically create the provided value. Can be synchronous or asynchronous.
 * @property {T} [useValue] - A literal value provided directly by this configuration.
 * @property {Id<any>[]} [deps] - An optional array of dependency identifiers, used to manually define dependencies when reflection metadata is unavailable.
 * @property {OnClose<T>} [onClose] - An optional lifecycle hook invoked for cleanup or resource management when the provider is disposed.
 */
export type Provider<T = any> = {
    kind: ScopeKind;
    id: Id<T>;
    qualifier?: Qualifier;

    // Three ways to create:
    useClass?: Ctor<T>;            // new Impl(...deps)
    useFactory?: Factory<T>;       // (ctx) => instance (sync/async)
    useValue?: T;                  // literal

    // If you don't want reflect-metadata:
    deps?: Id<any>[];

    // lifecycle:
    onClose?: OnClose<T>;
};

/**
 * Represents a Module object that contains an array of providers.
 *
 * @typedef {Object} Module
 * @property {Provider[]} providers - An array of providers associated with the module.
 */
export type Module = { providers: Provider[] };

/**
 * Represents a function to create a module object with the specified providers.
 *
 * @param {...Provider[]} providers - An array of providers to include in the module.
 * @returns {Module} An object containing the specified providers.
 */
export const module = (...providers: Provider[]): Module => ({providers});
/**
 * Combines multiple modules into a single module by merging their providers.
 *
 * @param {...Module} mods - The array of modules to be combined.
 * @returns {Module} A new module object containing the combined providers from all input modules.
 */
export const modules = (...mods: Module[]): Module => ({providers: mods.flatMap(m => m.providers)});

/**
 * Represents base options for a generic type T configuration.
 *
 * This type is used to define optional properties
 * that can configure the behavior or dependencies of T.
 *
 * @template T - The type for which the options apply.
 *
 * @property {Qualifier} [qualifier] - An optional qualifier to uniquely identify the instance or configuration.
 * @property {Id<any>[]} [deps] - An optional array of dependencies represented as identifiers.
 * @property {OnClose<T>} [onClose] - An optional callback to be invoked when the instance or configuration is closed.
 */
type BaseOpts<T> = {
    qualifier?: Qualifier;
    deps?: Id<any>[];
    onClose?: OnClose<T>;
};

/**
 * Creates a single provider instance for a given class constructor.
 *
 * @param ctor The class constructor used to identify the provider.
 * @param optsOrFactory Optional configuration object or factory function for the provider.
 * @return A provider object representing a single instance of the given class.
 */
export function singleOf<T>(ctor: Ctor<T>, optsOrFactory?: BaseOpts<T> | Factory<T>): Provider<T> {
    if (typeof optsOrFactory === 'function') {
        return {kind: 'single', id: ctor, useFactory: optsOrFactory as Factory<T>};
    }
    return {kind: 'single', id: ctor, useClass: ctor, ...optsOrFactory};
}

/**
 * Creates a provider instance for a given constructor, optionally extending behavior with factory or additional options.
 *
 * @param ctor The constructor function for which the provider is being created.
 * @param optsOrFactory Optional parameter which can be base options for the provider or a factory function.
 * @return A provider object configured based on the given constructor and options or factory.
 */
export function factoryOf<T>(ctor: Ctor<T>, optsOrFactory?: BaseOpts<T> | Factory<T>): Provider<T> {
    if (typeof optsOrFactory === 'function') {
        return {kind: 'factory', id: ctor, useFactory: optsOrFactory as Factory<T>};
    }
    return {kind: 'factory', id: ctor, useClass: ctor, ...optsOrFactory};
}

/**
 * Creates a scoped provider based on the given constructor and options or factory function.
 *
 * @param {Ctor<T>} ctor - The constructor function to create an instance of the provided type.
 * @param {BaseOpts<T> | Factory<T>} [optsOrFactory] - Optional configuration object or a factory function for creating the instance.
 * @return {Provider<T>} A scoped provider configured with the given constructor, options, or factory function.
 */
export function scopedOf<T>(ctor: Ctor<T>, optsOrFactory?: BaseOpts<T> | Factory<T>): Provider<T> {
    if (typeof optsOrFactory === 'function') {
        return {kind: 'scoped', id: ctor, useFactory: optsOrFactory as Factory<T>};
    }
    return {kind: 'scoped', id: ctor, useClass: ctor, ...optsOrFactory};
}

/**
 * Type definition for the configuration options when starting a process or mechanism.
 *
 * @typedef {Object} StartOptions
 * @property {boolean} [allowOverride=false] Determines whether overriding is permitted. If set to false, an error will occur when a duplicate entry is encountered.
 * @property {'error' | 'lastWins'} [overrideStrategy='error'] Specifies the strategy to apply when overriding. If `allowOverride` is true, the default is `lastWins`; otherwise, it defaults to `error`.
 */
type StartOptions = {
    allowOverride?: boolean;
    overrideStrategy?: 'error' | 'lastWins';
};

/**
 * ProvMap is a specialized Map structure designed to map an identifier (`Id<any>`)
 * to another Map. The inner Map associates either a `Qualifier` or `undefined` key
 * with a `Provider` value.
 *
 * This type can be used to manage associations between unique identifiers,
 * optional qualifiers, and their respective providers.
 *
 * Structure:
 * - The outer Map uses `Id<any>` as the key for identifying unique resources or entities.
 * - The value corresponding to each `Id<any>` key is another Map.
 * - The inner Map uses keys that can either be a `Qualifier` or `undefined`, and maps them to a `Provider`.
 *
 * Use Cases:
 * - Managing dependencies in dependency injection frameworks.
 * - Structuring complex relationships between unique IDs, optional qualifiers, and their providers.
 */
type ProvMap = Map<Id<any>, Map<Qualifier | undefined, Provider>>;

/**
 * A dependency injection container for managing configurable dependency instances, lifecycle management,
 * and dependency resolution.
 */
class Container {
    private singles = new Map<any, any>();
    private providers: ProvMap = new Map();
    private resolving = new Set<string>();
    private readonly parent?: Container;
    private scopedCache = new Map<any, any>();
    private disposables: Array<{ key: string; instance: any; close?: (i: any) => any }> = [];

    private allowOverride = false;
    private overrideStrategy: 'error' | 'lastWins' = 'error';

    constructor(parent?: Container, opts?: StartOptions) {
        this.parent = parent;
        if (opts) this.configure(opts);
    }

    configure(opts: StartOptions) {
        this.allowOverride = !!opts.allowOverride;
        this.overrideStrategy = opts.overrideStrategy ?? (this.allowOverride ? 'lastWins' : 'error');
    }

    load(mod: Module) {
        for (const p of mod.providers) this.setProvider(p);
    }

    beginScope(): Container {
        return new Container(this, {allowOverride: this.allowOverride, overrideStrategy: this.overrideStrategy});
    }

    get<T>(id: Id<T>, q?: Qualifier): T {
        const k = this.keyOf(id, q);

        if (this.singles.has(k)) return this.singles.get(k);
        if (this.scopedCache.has(k)) return this.scopedCache.get(k);

        const p = this.getProvider(id, q);
        if (!p) {
            if (typeof id === 'function') return this.construct(id as Ctor<T>); // fallback: "nu" class
            throw new Error(`No provider for: ${k}`);
        }

        if (this.resolving.has(k)) throw new Error(`Circular dependency detected at ${k}`);
        this.resolving.add(k);

        const maybe = this.instantiate<T>(p);
        if (maybe instanceof Promise) {
            throw new Error(`Tried to resolve async provider with sync get(): ${k}. Use getAsync().`);
        }
        const instance = maybe;

        this.cacheAndTrack(p, k, instance);
        this.resolving.delete(k);
        return instance;
    }

    async getAsync<T>(id: Id<T>, q?: Qualifier): Promise<T> {
        const k = this.keyOf(id, q);

        if (this.singles.has(k)) return this.singles.get(k);
        if (this.scopedCache.has(k)) return this.scopedCache.get(k);

        const p = this.getProvider(id, q);
        if (!p) {
            if (typeof id === 'function') return this.constructAsync(id as Ctor<T>);
            throw new Error(`No provider for: ${k}`);
        }

        if (this.resolving.has(k)) throw new Error(`Circular dependency detected at ${k}`);
        this.resolving.add(k);

        const maybe = this.instantiate<T>(p);
        const instance = maybe instanceof Promise ? await maybe : maybe;

        this.cacheAndTrack(p, k, instance);
        this.resolving.delete(k);
        return instance;
    }

    override<T>(id: Id<T>, value: T, q?: Qualifier) {
        const p: Provider<T> = {kind: 'single', id, qualifier: q, useValue: value};
        this.setProvider(p);
        const k = this.keyOf(id, q);
        this.root().singles.set(k, value);
    }

    async shutdown() {
        for (let i = this.disposables.length - 1; i >= 0; i--) {
            const d = this.disposables[i];
            try {
                if (d.close) {
                    const r = d.close(d.instance);
                    if (r instanceof Promise) await r;
                } else {
                    await tryAutoDispose(d.instance);
                }
            } catch {
                /* swallow */
            }
        }
        this.disposables = [];
        this.singles.clear();
        this.scopedCache.clear();
    }

    reset() {
        this.singles.clear();
        this.providers.clear();
        this.resolving.clear();
        this.scopedCache.clear();
        this.disposables = [];
    }

    // ---------- internal helpers ----------
    private setProvider(p: Provider) {
        let inner = this.providers.get(p.id);
        if (!inner) {
            inner = new Map();
            this.providers.set(p.id, inner);
        }
        const key = p.qualifier;
        const kStr = this.keyOf(p.id, key);

        if (inner.has(key)) {
            if (!this.allowOverride || this.overrideStrategy === 'error') {
                throw new BeanOverrideError(kStr);
            }
            // lastWins: replaces
        }
        inner.set(key, p);
    }

    private getProvider<T>(id: Id<T>, q?: Qualifier): Provider<T> | undefined {
        return this.providers.get(id)?.get(q) ?? this.parent?.getProvider(id, q);
    }

    private keyOf<T>(id: Id<T>, q?: Qualifier): string {
        const qStr = q === undefined ? '' : `::${String(q)}`;
        // Use the constructor identity in the map; here we only create a string for logs/errors.
        return `${(id as any).name || '[[ctor]]'}${qStr}`;
    }

    private cacheAndTrack<T>(p: Provider<T>, keyStr: string, instance: T) {
        if (p.kind === 'single') this.root().singles.set(keyStr, instance);
        if (p.kind === 'scoped') this.scopedCache.set(keyStr, instance);
        if (p.kind !== 'factory') this.disposables.push({key: keyStr, instance, close: p.onClose});
    }

    private root(): Container {
        return this.parent ? this.parent.root() : this;
    }

    private instantiate<T>(p: Provider<T>): T | Promise<T> {
        if (p.useValue !== undefined) return p.useValue as T;

        if (p.useFactory) {
            return p.useFactory({
                get: this.get.bind(this),
                getAsync: this.getAsync.bind(this),
            }) as any;
        }

        if (p.useClass) {
            if (p.deps?.length) {
                const args = p.deps.map(d => this.get(d));
                return new (p.useClass as Ctor<T>)(...args);
            }
            return this.construct(p.useClass);
        }

        throw new Error(`Invalid provider for ${this.keyOf(p.id, p.qualifier)}`);
    }

    private construct<T>(ctor: Ctor<T>): T {
        const getMeta = (Reflect as any)?.getMetadata?.bind(Reflect);
        const paramTypes: any[] = getMeta ? getMeta('design:paramtypes', ctor) ?? [] : [];
        if (paramTypes.length) {
            const args = paramTypes.map(dep => this.get(dep));
            return new ctor(...args);
        }
        return new ctor();
    }

    private async constructAsync<T>(ctor: Ctor<T>): Promise<T> {
        const getMeta = (Reflect as any)?.getMetadata?.bind(Reflect);
        const paramTypes: any[] = getMeta ? getMeta('design:paramtypes', ctor) ?? [] : [];
        if (paramTypes.length) {
            const args = await Promise.all(paramTypes.map(dep => this.getAsync(dep)));
            return new ctor(...args);
        }
        return new ctor();
    }
}

async function tryAutoDispose(obj: any) {
    const fns = ['dispose', 'close', 'destroy'];
    for (const fn of fns) {
        const m = obj?.[fn];
        if (typeof m === 'function') {
            const r = m.call(obj);
            if (r instanceof Promise) await r;
            return;
        }
    }
}

let _container = new Container();

/**
 * Initializes the dependency injection container with the provided modules and options.
 *
 * @param {...(Module|StartOptions)[]} modsOrOpts - An array of modules and/or options.
 * Modules are objects containing providers, while options configure the container.
 * @return {void} Does not return a value.
 */
export function startDI(...modsOrOpts: (Module | StartOptions)[]) {
    const mods: Module[] = [];
    let opts: StartOptions | undefined;
    for (const m of modsOrOpts) {
        if ((m as Module).providers) mods.push(m as Module);
        else opts = m as StartOptions;
    }
    _container = new Container(undefined, opts ?? {});
    _container.load(modules(...mods));
}

/**
 * Creates and begins a new scope within the dependency injection container, allowing encapsulated dependency resolution.
 * The scope provides methods to retrieve dependencies synchronously or asynchronously and to properly clean up resources when done.
 *
 * @return {Object} An object containing the following methods:
 * - `get(id, q)`: Resolves a dependency synchronously within the scope.
 * - `getAsync(id, q)`: Resolves a dependency asynchronously within the scope.
 * - `end()`: Ends the scope and releases any resources associated with it.
 */
export function beginScope() {
    const scope = _container.beginScope();
    return {
        get: <T>(id: Id<T>, q?: Qualifier) => scope.get(id, q),
        getAsync: <T>(id: Id<T>, q?: Qualifier) => scope.getAsync(id, q),
        end: () => scope.shutdown(),
    };
}

/**
 * Retrieves an instance of a registered type from the dependency injection container.
 *
 * @param id The unique identifier of the type to retrieve.
 * @param q An optional qualifier to further distinguish the specific instance to retrieve.
 * @return The retrieved instance of the requested type.
 */
export function inject<T>(id: Id<T>, q?: Qualifier): T {
    return _container.get(id, q);
}

/**
 * Asynchronously retrieves an instance of the specified type associated with the given identifier and optional qualifier.
 *
 * @param {Id<T>} id - The identifier representing the type of the instance to resolve.
 * @param {Qualifier} [q] - An optional qualifier to distinguish between multiple bindings of the same type.
 * @return {Promise<T>} A promise that resolves to the requested instance of the specified type.
 */
export function injectAsync<T>(id: Id<T>, q?: Qualifier): Promise<T> {
    return _container.getAsync(id, q);
}

/**
 * Overrides the binding of a specific identifier in the container with the given value.
 *
 * @param {Id<T>} id - The identifier to override.
 * @param {T} value - The new value to bind to the given identifier.
 * @param {Qualifier} [q] - An optional qualifier to apply to the override.
 * @return {void} This method does not return a value.
 */
export function override<T>(id: Id<T>, value: T, q?: Qualifier) {
    _container.override(id, value, q);
}

/**
 * Shuts down the Dependency Injection (DI) container by invoking its shutdown procedure.
 * Ensures that all resources managed by the DI container are properly released.
 *
 * @return {Promise<void>} A promise that resolves once the DI container has been successfully shut down.
 */
export async function shutdownDI() {
    await _container.shutdown();
}

/**
 * Resets the dependency injection (DI) container to its initial state.
 * This will clear any previously registered dependencies or configurations within the container.
 *
 * @return {void} Does not return a value.
 */
export function resetDI() {
    _container.reset();
}
