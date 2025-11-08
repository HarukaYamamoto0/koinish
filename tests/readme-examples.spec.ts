import {factoryOf, inject, module, shutdownDI, singleOf, startDI} from '../src';
import {describe, expect, it} from 'vitest';

describe('README examples', () => {
    it('runs without throwing', async () => {

        class Repo {
            list() {
                return ['item1', 'item2'];
            }
        }

        class Service {
            constructor(public repo: Repo) {
            }

            ping() {
                return 'pong';
            }
        }

        class Controller {
            constructor(public service: Service) {
            }
        }

        // Declare your module:
        const appModule = module(
            singleOf(Repo),
            singleOf(Service, {deps: [Repo]}), // or rely on reflection metadata if available
            factoryOf(Controller, ({get}) => new Controller(get(Service))),
        );

        // Start DI
        startDI(appModule);

        // Retrieve instances
        const controller = inject(Controller);
        console.log(controller.service.ping()); // → "pong"

        // Gracefully shut down
        await shutdownDI();
        expect(true).toBe(true);
    });
});
