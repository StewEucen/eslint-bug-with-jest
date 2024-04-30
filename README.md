# ESLint bug with Jest

## Overview

* Summarize the steps to reproduce the ESLint bug with Jest.

## Background

* When invoking `ESLint#readFiles()` with Jest in a project that was constructed using CommonJS, an exception will be thrown.
* This repository has the minimum configuration that reproduces the exception.

## Steps to Reproduce

0. Environment

    ```
    Node version: 20.12.2
    npm version: 10.5.0
    ESLint version: 9.1.1
    ```

1. Clone this repository in your local machine.

    ```sh
    git clone https://github.com/StewEucen/eslint-bug-with-jest.git
    ```

2. Set up packages.

    ```sh
    npm install
    ```

3. Invoke test.

    ```sh
    npm test
    ```

4. Confirm the error log in terminal.

    ```sh
    FAIL  tests/__tests__/eslint-bug.js
      ESLint Bug
        ✕ should not throw an error (95 ms)

      ● ESLint Bug › should not throw an error

        Result is not a promise.

          13 |     const expectedLength = 3
          14 |
        > 15 |     const results = await eslint.lintFiles(filePaths)
            |                     ^
          16 |
          17 |     expect(results)
          18 |       .toHaveLength(expectedLength)

          at Retrier.retry (node_modules/@humanwhocodes/retry/dist/retrier.cjs:197:35)
              at Array.map (<anonymous>)
          at Object.<anonymous> (tests/__tests__/eslint-bug.js:15:21)

    Test Suites: 1 failed, 1 total
    Tests:       1 failed, 1 total
    Snapshots:   0 total
    Time:        1.268 s
    Ran all test suites.
    ```

## Cause

* Confirm the error message `Result is not a promise.` in error log above.

* The error message is thrown here.

  https://github.com/humanwhocodes/retry/blob/retry-v0.2.3/src/retrier.js#L195

  ```js
  export class Retrier {
      ...

      retry(fn) {
          ...

          if (!(result instanceof Promise)) {
              return Promise.reject(new Error("Result is not a promise."));
          }

          ...
      }

      ...
  }
  ```

### Stack Tracking

1. Invoke `retrier.retry()` in `ESLint#lintFiles()`

    https://github.com/eslint/eslint/blob/v9.1.1/lib/eslint/eslint.js#L925

    ```js
    class ESLint {
        ...

        async lintFiles(patterns) {
            ...

            const results = await Promise.all(
                filePaths.map(({ filePath, ignored }) => {
                    ...

                    return retrier.retry(() => fs.readFile(filePath, { encoding: "utf8", signal: controller.signal })
                        .then(text => {
                          ...
                        }))
                        .catch(error => {
                          ...
                        });
                })
            );

            ...
        }

        ...
    }
    ```

2. Invoke `result instanceof Promise` in `Retrier#retry()`. However, it returns `false`

    https://github.com/humanwhocodes/retry/blob/retry-v0.2.3/src/retrier.js#L194

    ```js
    export class Retrier {
        ...

        retry(fn) {

            let result;

            try {
                result = fn();
            } catch (/** @type {any} */ error) {
                return Promise.reject(new Error(`Synchronous error: ${error.message}`, { cause: error }));
            }

            // if the result is not a promise then reject an error
            if (!(result instanceof Promise)) {
                return Promise.reject(new Error("Result is not a promise."));
            }

            ...
        }

        ...
    }
    ```

3. `result = fn()` is set an instance of `Promise` certainly, however `result instanceof Promise` is `false`.

## Mechanism

* See the logic in `Retrier#retry()`.
* `result = fn()` must be an instance of `Promise` to avoid guard clause `if (!(result instanceof Promise)) { }`.

  https://github.com/humanwhocodes/retry/blob/retry-v0.2.3/src/retrier.js#L188

  ```js
  export class Retrier {
      ...

      retry(fn) {

          let result;

          try {
              result = fn();
          } catch (/** @type {any} */ error) {
              return Promise.reject(new Error(`Synchronous error: ${error.message}`, { cause: error }));
          }

          // if the result is not a promise then reject an error
          if (!(result instanceof Promise)) {
              return Promise.reject(new Error("Result is not a promise."));
          }

          ...
      }

      ...
  }
  ```

* See how to call `Retrier#retry()` in `ESLint#lintFiles()` below.
* The function given as argument to `retrier.retry()` returns `fs.readFile()`, and it returns `Promise` instance certainly.
* It sounds OK at first glance.

  https://github.com/eslint/eslint/blob/v9.1.1/lib/eslint/eslint.js#L925

  ```js
  class ESLint {
      ...

      async lintFiles(patterns) {
          ...

          const results = await Promise.all(
              filePaths.map(({ filePath, ignored }) => {
                  ...

                  return retrier.retry(() => fs.readFile(filePath, { encoding: "utf8", signal: controller.signal })
                      .then(text => {
                        ...
                      }))
                      .catch(error => {
                        ...
                      });
              })
          );

          ...
      }

      ...
  }
  ```

* See the image below. These `Promise` instances used in actual code are not created from the same `Promise` declaration.
* `Retrier#retry()` uses `Promise` declared in `lib.es2015.iterable.d.ts`
* `fs.readFile()` uses `Promise` declared in `lib.es5.d.ts`

  ![Reference of Promise](./reference-of-promise.png)

## How to Fix

* It works.

  https://github.com/eslint/eslint/blob/v9.1.1/lib/eslint/eslint.js#L925

  ```js
  class ESLint {
      ...

      async lintFiles(patterns) {
          ...

          const results = await Promise.all(
              filePaths.map(({ filePath, ignored }) => {
                  ...

  -                return retrier.retry(() => fs.readFile(filePath, { encoding: "utf8", signal: controller.signal })
  +                return retrier.retry(async () => fs.readFile(filePath, { encoding: "utf8", signal: controller.signal })
                      .then(text => {
                        ...
                      }))
                      .catch(error => {
                        ...
                      });
              })
          );

          ...
      }

      ...
  }
  ```

* The function given as argument to `retrier.retry()` is not an async function in original code.
* When we change it to an async function, an instance of `Promise` will be created in `retrier.retry()` on invocation. It is not the same `Promise` instance created by `fs.readFile()`.
* When `fn` is async function, `fn()` create a `Promise` instance according to context on invoking.
* `result = fn()` and `result instanceof Promise` are in the same context, thus both expressions use the same `Promise`.
* Since `result instanceof Promise` is true, we can prevent the incorrect Error from being thrown.

  https://github.com/humanwhocodes/retry/blob/retry-v0.2.3/src/retrier.js#L183-L196

  ```js
  export class Retrier {
      ...

      retry(fn) {

          let result;

          try {
              result = fn();
          } catch (/** @type {any} */ error) {
              return Promise.reject(new Error(`Synchronous error: ${error.message}`, { cause: error }));
          }

          // if the result is not a promise then reject an error
          if (!(result instanceof Promise)) {
              return Promise.reject(new Error("Result is not a promise."));
          }

          ...
      }

      ...
  }
  ```

## Result

* `npm test` will pass all test cases after fixed.

  ```sh
  PASS  tests/__tests__/eslint-bug.js
    ESLint Bug
      ✓ should not throw an error (117 ms)

  Test Suites: 1 passed, 1 total
  Tests:       1 passed, 1 total
  Snapshots:   0 total
  Time:        0.969 s, estimated 1 s
  Ran all test suites.
  ```

## Side Effect

* There is no side effects caused by the fixing, because both codes return the same result.

  ```js
  fs.readFile(...)

  // A instance of promise wrapped by other promise
  new Promise((resolve, reject) => {
    fs.readFile(...)
      .then(resolve)
      .catch(reject)
  })
  ```

## Note

* If the implementation part to confirm instance of Promise in `@humanwhocodes/retry` is modified in `0.2.4` or later versions in the future, this repository will not reproduce throwing an exception.
