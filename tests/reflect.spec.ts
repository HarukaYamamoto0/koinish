import 'reflect-metadata';

import {factoryOf, inject, module, modules, resetDI, shutdownDI, singleOf, startDI,} from '../src';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';

describe('koinish (with reflect-metadata)', () => {
    beforeEach(() => {
        resetDI();
    });

    afterEach(async () => {
        await shutdownDI();
        resetDI();
    });

    class Repo {
        id = Math.random();

        list() {
            return ['a', 'b'];
        }
    }

    class Service {
        // If emitDecoratorMetadata is enabled, a Repo type will be in design:paramtypes
        constructor(public repo: Repo) {
        }

        ping() {
            return 'pong';
        }
    }

    class Presenter {
        constructor(public service: Service) {
        }
    }

    it('constructor auto-injection via reflect-metadata when metadata is present (otherwise ignored)', () => {
        const getMeta = (Reflect as any)?.getMetadata?.bind(Reflect);
        const paramTypes: any[] = getMeta ? getMeta('design:paramtypes', Service) ?? [] : [];
        const hasParamTypes = !!(getMeta && paramTypes.length > 0);

        const m = module(
            singleOf(Repo),
            singleOf(Service), // no explicit deps here; relies on metadata if available
            factoryOf(Presenter, {deps: [Service]}),
        );
        startDI(m);

        const svc = inject(Service);
        expect(svc).toBeInstanceOf(Service);

        if (hasParamTypes) {
            expect(svc.repo).toBeInstanceOf(Repo);
        } else {
            // In environments where design:paramtypes isn't emitted, we accept "ignored" behavior.
            expect(svc.repo === undefined || svc.repo instanceof Repo).toBe(true);
        }
    });

    it('still supports manual deps even with reflect-metadata available', () => {
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

    it('fallback: unregistered class with no deps is constructed directly (smoke)', () => {
        class Unregistered {
            x = 42;
        }

        startDI(module());
        const u = inject(Unregistered);
        expect(u.x).toBe(42);
    });

    it('modules(...) basic merge still works (smoke)', () => {
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
