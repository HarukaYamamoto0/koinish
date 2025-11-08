import {
    module, singleOf, factoryOf, scopedOf,
    startDI, inject, beginScope, shutdownDI
} from '../src';

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