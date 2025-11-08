import {
    BeanOverrideError,
    beginScope,
    factoryOf,
    inject,
    injectAsync,
    module,
    modules,
    override,
    resetDI,
    scopedOf,
    shutdownDI,
    singleOf,
    startDI,
} from '../src';

describe('koinish (no reflect-metadata)', () => {
    beforeEach(() => {
        resetDI();
    });

    afterEach(async () => {
        await shutdownDI();
        resetDI();
    });

    // --- dummies ---
    class Repo {
        id = Math.random();

        list() {
            return ['a', 'b'];
        }
    }

    class Service {
        // NOTE: in the no-reflect suite, we rely on deps or factories (not metadata)
        constructor(public repo?: Repo) {
        }

        ping() {
            return 'pong';
        }
    }

    class Presenter {
        constructor(public service: Service) {
        }
    }

    it('singleOf returns the same instance; factoryOf returns new instances', () => {
        const m = module(
            singleOf(Repo),
            singleOf(Service, {deps: [Repo]}),
            factoryOf(Presenter, {deps: [Service]}),
        );
        startDI(m);

        const r1 = inject(Repo);
        const r2 = inject(Repo);
        expect(r1).toBe(r2);

        const p1 = inject(Presenter);
        const p2 = inject(Presenter);
        expect(p1).not.toBe(p2);
        expect(p1.service).toBeInstanceOf(Service);
        expect(p1.service.repo).toBeInstanceOf(Repo);
    });

    it('manual deps injection works without reflect-metadata', () => {
        class A {
        }

        class B {
            constructor(public a: A) {
            }
        }

        const m = module(
            singleOf(A),
            singleOf(B, {deps: [A]}),
        );
        startDI(m);

        const b = inject(B);
        expect(b).toBeInstanceOf(B);
        expect(b.a).toBeInstanceOf(A);
    });

    it('fallback: unregistered class with no deps is constructed directly', () => {
        class Unregistered {
            x = 42;
        }

        startDI(module());
        const u = inject(Unregistered);
        expect(u.x).toBe(42);
    });

    it('scopedOf: same instance within scope, different across scopes; end() disposes', async () => {
        let disposed = 0;

        class RequestCtx {
            constructor(public id = Math.random()) {
            }

            dispose() {
                disposed++;
            }
        }

        const m = module(scopedOf(RequestCtx));
        startDI(m);

        const s1 = beginScope();
        const s2 = beginScope();

        const a1 = s1.get(RequestCtx);
        const a2 = s1.get(RequestCtx);
        const b1 = s2.get(RequestCtx);

        expect(a1).toBe(a2);
        expect(a1).not.toBe(b1);

        await s1.end();
        expect(disposed).toBe(1);
        await s2.end();
        expect(disposed).toBe(2);
    });

    it('onClose on singles is called at shutdownDI; auto close/dispose/destroy also works', async () => {
        const closed: string[] = [];

        class Db {
            name = 'db';

            close() {
                closed.push('auto');
            }
        }

        class Cache {
            name = 'cache';
        }

        const m = module(
            singleOf(Db),
            singleOf(Cache, {onClose: (c) => closed.push(`manual:${c.name}`)}),
        );

        startDI(m);
        inject(Db);
        inject(Cache);

        await shutdownDI();

        expect(closed.sort()).toEqual(['auto', 'manual:cache'].sort());
    });

    it('async factory + injectAsync works', async () => {
        class Conn {
            constructor(public url: string) {
            }
        }

        class Db {
            constructor(public conn: Conn) {
            }
        }

        const m = module(
            singleOf(Conn, async () => new Conn('memory://')),
            singleOf(Db, async ({getAsync}) => new Db(await getAsync(Conn))),
        );
        startDI(m);

        const db = await injectAsync(Db);
        expect(db).toBeInstanceOf(Db);
        expect(db.conn.url).toBe('memory://');
    });

    it('override policy: throws by default and allows lastWins when enabled', () => {
        class S {
        }

        class Impl1 extends S {
        }

        class Impl2 extends S {
        }

        const A = module(singleOf(S, () => new Impl1()));
        const B = module(singleOf(S, () => new Impl2()));

        // default: error on override
        expect(() => startDI(A, B)).toThrow(BeanOverrideError);

        // allow lastWins
        startDI(A, B, {allowOverride: true, overrideStrategy: 'lastWins'});
        const s = inject(S);
        expect(s).toBeInstanceOf(Impl2);
    });

    it('override() at runtime replaces a single (with allowOverride)', () => {
        class Clock {
            now() {
                return 1;
            }
        }

        // enable override policy for this test
        startDI(module(singleOf(Clock)), {allowOverride: true, overrideStrategy: 'lastWins'});

        expect(inject(Clock).now()).toBe(1);
        override(Clock, {now: () => 999} as unknown as Clock);
        expect(inject(Clock).now()).toBe(999);
    });

    it('detects a circular dependency (A -> B, B -> A)', () => {
        class A {
            constructor(public b: B) {
            }
        }

        class B {
            constructor(public a: A) {
            }
        }

        const m = module(
            singleOf(A, {deps: [B]}),
            singleOf(B, {deps: [A]}),
        );
        startDI(m);

        expect(() => inject(A)).toThrow(/Circular dependency/i);
    });

    it('modules(...) merges modules and preserves registration order', () => {
        class A {
        }

        class B {
        }

        const m1 = module(singleOf(A));
        const m2 = module(singleOf(B));

        startDI(modules(m1, m2));

        expect(inject(A)).toBeInstanceOf(A);
        expect(inject(B)).toBeInstanceOf(B);
    });
});
