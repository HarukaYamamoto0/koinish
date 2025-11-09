export type Ctor<T> = new (...args: any[]) => T;
export type Id<T> = Ctor<T>;
export type ScopeKind = 'single' | 'factory' | 'scoped';
export type Qualifier = string | symbol;

/**
 * Custom error class representing an error that occurs when there is
 * an attempt to override a provider for a specific bean key.
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

export type Provider<T = any> = {
    kind: ScopeKind;
    id: Id<T>;
    qualifier?: Qualifier;

    useClass?: Ctor<T>;
    useFactory?: Factory<T>;
    useValue?: T;

    // If you don't want reflect-metadata:
    deps?: Id<any>[];

    // lifecycle:
    onClose?: OnClose<T>;
};

export type Module = { providers: Provider[] };

/**
 * Creates a Module object containing the provided list of providers.
 *
 * @function module
 * @param {...Provider} providers - A rest parameter taking one or more Provider objects to be included in the module.
 * @returns {Module} An object with a provider property containing the array of supplied providers.
 */
export const module = (...providers: Provider[]): Module => ({providers});

/**
 * Combines multiple module definitions into a single module by merging their providers.
 *
 * @param {...Module} mods - An array of module objects to be combined.
 *                           Each module is expected to have a `providers` property.
 * @returns {Module} - A new module object containing a consolidated list of providers
 *                     from all input modules.
 */
export const modules = (...mods: Module[]): Module => ({providers: mods.flatMap(m => m.providers)});

type BaseOpts<T> = {
    qualifier?: Qualifier;
    deps?: Id<any>[];
    onClose?: OnClose<T>;
};

/**
 * Registers a singleton provider for a given class constructor. The provider can either use a factory or configuration options.
 *
 * @param ctor The class constructor for which the singleton provider is being registered.
 * @param optsOrFactory Optional. A factory function that creates an instance of the class or a set of configuration options for the provider.
 * @return A provider object configured to provide a singleton instance of the given class.
 */
export function singleOf<T>(ctor: Ctor<T>, optsOrFactory?: BaseOpts<T> | Factory<T>): Provider<T> {
    if (typeof optsOrFactory === 'function') {
        return {kind: 'single', id: ctor, useFactory: optsOrFactory as Factory<T>};
    }
    return {kind: 'single', id: ctor, useClass: ctor, ...optsOrFactory};
}

/**
 * Creates a factory `Provider` for the given constructor and additional options or factory function.
 *
 * @template T - The type of instance to create
 * @param {Ctor<T>} ctor - The constructor function for which the factory is created.
 * @param {BaseOpts<T> | Factory<T>} [optsOrFactory] - Optional factory function or options to configure the provider.
 * @return {Provider<T>} A factory `Provider` configured with the supplied constructor and options or factory.
 */
export function factoryOf<T>(ctor: Ctor<T>, optsOrFactory?: BaseOpts<T> | Factory<T>): Provider<T> {
    if (typeof optsOrFactory === 'function') {
        return {kind: 'factory', id: ctor, useFactory: optsOrFactory as Factory<T>};
    }
    return {kind: 'factory', id: ctor, useClass: ctor, ...optsOrFactory};
}

/**
 * Creates a scoped provider for the given constructor with optional configuration or factory.
 *
 * @template T - The type of instance to create
 * @param {Ctor<T>} ctor - The constructor function or class for which the scoped provider is created.
 * @param {BaseOpts<T> | Factory<T>} [optsOrFactory] - Optional configuration for the scoped provider or a factory function that generates the instance.
 * @return {Provider<T>} A scoped provider object configured with the specified constructor and optional options or factory.
 */
export function scopedOf<T>(ctor: Ctor<T>, optsOrFactory?: BaseOpts<T> | Factory<T>): Provider<T> {
    if (typeof optsOrFactory === 'function') {
        return {kind: 'scoped', id: ctor, useFactory: optsOrFactory as Factory<T>};
    }
    return {kind: 'scoped', id: ctor, useClass: ctor, ...optsOrFactory};
}

type StartOptions = {
    allowOverride?: boolean;
    overrideStrategy?: 'error' | 'lastWins';
};

type ProvMap = Map<Id<any>, Map<Qualifier | undefined, Provider>>;

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

    configure(opts: StartOptions): void {
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
 * Starts the Dependency Injection (DI) container with the provided modules or options.
 *
 * @param {...(Module|StartOptions)[]} modsOrOpts - A list of Modules or StartOptions. Modules are used to define providers, and StartOptions allow additional configuration.
 * @return {void} No return value.
 */
export function startDI(...modsOrOpts: (Module | StartOptions)[]): void {
    const mods: Module[] = [];
    let opts: StartOptions | undefined;
    for (const m of modsOrOpts) {
        if ((m as Module).providers) mods.push(m as Module);
        else opts = m as StartOptions;
    }
    _container = new Container(undefined, opts ?? {});
    _container.load(modules(...mods));
}

export type Scope = {
    get<U>(id: Id<U>, q?: Qualifier): U;
    getAsync<U>(id: Id<U>, q?: Qualifier): Promise<U>;
    end(): Promise<void>;
};

/**
 * Initiates a new scope that provides controlled lifecycle management for dependency resolution.
 * This method creates a scoped environment where dependencies can be resolved and managed.
 * The returned scope provides methods to retrieve objects synchronously, retrieve them asynchronously,
 * and terminate the scope when it's no longer necessary.
 *
 * @return {Scope} An object representing the newly created scope, with methods to retrieve dependencies and end the scope.
 */
export function beginScope(): Scope {
    const scope = _container.beginScope();
    return {
        get: <T>(id: Id<T>, q?: Qualifier) => scope.get(id, q),
        getAsync: <T>(id: Id<T>, q?: Qualifier) => scope.getAsync(id, q),
        end: () => scope.shutdown(),
    };
}

/**
 * Retrieves an instance of the specified type from the dependency injection container.
 *
 * @template T - The type of instance to create
 * @param {Id<T>} id - The identifier used to locate and retrieve the instance from the container.
 * @param {Qualifier} [q] - An optional qualifier to further specify the desired instance.
 * @return {T} The instance of the specified type retrieved from the container.
 */
export function inject<T>(id: Id<T>, q?: Qualifier): T {
    return _container.get(id, q);
}

/**
 * Asynchronously retrieves an instance of the specified type from the container.
 *
 * @template T - The type of instance to create
 * @param {Id<T>} id The identifier for the type of instance to retrieve.
 * @param {Qualifier} [q] An optional qualifier to distinguish between different instances of the same type.
 * @return {Promise<T>} A promise that resolves to the requested instance of the specified type.
 */
export function injectAsync<T>(id: Id<T>, q?: Qualifier): Promise<T> {
    return _container.getAsync(id, q);
}

/**
 * Overrides the value associated with the provided identifier in the container.
 *
 * @template T - The type of instance to create
 * @param {Id<T>} id - The identifier for the value to be overridden.
 * @param {T} value - The new value to associate with the identifier.
 * @param {Qualifier} [q] - An optional qualifier to distinguish between multiple bindings for the same identifier.
 * @return {void}
 */
export function override<T>(id: Id<T>, value: T, q?: Qualifier): void {
    _container.override(id, value, q);
}

/**
 * Shuts down the dependency injection container.
 * Cleans up resources and finalizes any asynchronous operations within
 * the dependency injection system.
 *
 * @return {Promise<void>} A promise that resolves when the shutdown process is complete.
 */
export async function shutdownDI(): Promise<void> {
    await _container.shutdown();
}

/**
 * Resets the DI (Dependency Injection) container to its initial state.
 * This method clears all registered dependencies and configurations,
 * preparing the container for a fresh setup.
 *
 * @return {void} This method does not return any value.
 */
export function resetDI(): void {
    _container.reset();
}
