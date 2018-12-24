[![npm][npm]][npm-url]
[![deps][deps]][deps-url]
[![test][test]][test-url]
[![coverage][coverage]][coverage-url]

# Webpack Polyfill Injector Plugin
This plugin uses polyfills from [polyfill-library](https://github.com/Financial-Times/polyfill-library) and inserts them into your bundle.

The benefits of this plugin are:
- Users with modern browsers will not be punished:
  - The script size increases only by some very small checks to see if the browser supports all required features natively (i.e. no polyfills are necessary)
  - If all required features are supported natively, then there is no additional HTTP request.
- It does not rely on an external service (e.g. a CDN). All scripts will be included in your bundle.
  - Failures of external services providing polyfills won't affect your users.
  - Serving all scripts from the same domain avoids problems with browser-plugins like `NoScript` or `uMatrix`.
- If a browser does not support some features, then *only the polyfills required for that specific browser* are loaded, all together in a *single additional HTTP request*.
  - All possible combinations of polyfills will be bundled as separate files. *No magic at runtime!* The files can be served by any dumb webserver.
  - If you don't feel well with `2^n - 1` bundled files for `n` polyfills, then there is an option to only bundle a single file containing all `n` polyfills. All browsers that are missing any feature will have to load this file, potentially wasting bandwith on unnecessary polyfills.
- The plugin even works for the `Promise` polyfill. Webpack's chunk loading internally uses `Promise`, therefore this plugin implements its own loading technique.


## Install

**Note:** The current version of this plugin requires webpack 4, for older webpack please use `^1.0.2`.

```bash
yarn add webpack-polyfill-injector --dev
```

or

```bash
npm install webpack-polyfill-injector --save-dev
```


## Usage
```javascript
const PolyfillInjectorPlugin = require('webpack-polyfill-injector');

module.exports = {
    entry: {
        app: `webpack-polyfill-injector?${JSON.stringify({
            modules: ['./resources/js/app.js'] // list your entry modules for the `app` entry chunk
        })}!` // don't forget the trailing exclamation mark!
    },
    output: {...},
    module: {...},
    plugins: [
        new PolyfillInjectorPlugin({
            polyfills: [
                'Promise',
                'Array.prototype.find',
            ]
        })
    ]
};
```

You always need to use `webpack-polyfill-injector` as loader in your entry chunks and as plugin in the plugin array.
They both take an `options` object as argument, where the plugin options specify default settings that the loader can override.

Loader and plugin work hand-in-hand as follows:
- The loader creates a small module that checks whether any of the specified polyfills are required.
  - If the browser supports all required features natively, then the entry modules are executed directly (by doing `require(...)` for every module listed in the `modules` option.)
  - If the browser misses some features, then the appropriate polyfill file will be loaded (by inserting a new `script` tag to the `head` of the html page). Afterwards, your entry modules will be executed.
  - It is possible to use the loader multiple times with different configurations, for example to inject polyfills into several entry chunks, possibly with different lists of polyfills.
- The plugin emits the files containing the polyfills.

### Options

The following options can be specified (for both loader and plugin, where loader options override plugin options):

| Option       | Type                 | Default | Description |
|--------------|----------------------|---------|-------------|
| `polyfills`  | `Array` of `String`s | *none*  | List of features that are required. Browsers will load polyfills for all features that are not supported natively.<br/>You can use any [polyfill from `polyfill-library`](https://github.com/Financial-Times/polyfill-library/tree/master/polyfills). See also [this list](https://polyfill.io/v2/docs/features/), but keep in mind that `webpack-polyfill-injector` creates staticly bundled files and therefore does not use the User-Agent string to determine which polyfills will be required, neither is there a default set. You need to explicitly list everything that is required by your application code. |
| `modules`    | `Array` of `String`s | *none*  | List of modules that are part of the current entry chunk. If you used to have `{name: ["./file1.js", "./file2.js"]}` as entry point then you will configure `{name: 'webpack-polyfill-injector?{modules:["./file1.js","./file2.js"]}!'}`.<br/>You can specify anything that can also be written inside a `require()` call, e.g. `'my-awesome-loader!./some-file.js'`. |
| `excludes`  | `Array` of `String`s | `[]`  | List of polyfills that should not be added even though another polyfill depends on it. |
| `singleFile` | `Boolean`            | `false` | Whether to create only a single file for all polyfills instead of `2^n - 1` files (one per subset). This will decrease your bundle size, but increase the bandwidth usage for browsers that support some (but not all) features natively. |
| `filename`   | `String`             | `output.filename` | The path and filename for generated polyfill files. The default is to use whatever is specified in `output.filename`. Make sure to include the `[name]` placeholder or use different `filename` settings if the list of polyfills differs between some entry chunks.
| `banner`     | `String`             | `'/*! For detailed credits and licence information see https://github.com/financial-times/polyfill-library */\n'` | The banner that is inserted on the top of all generated polyfill files. |


## Technical Details

Consider the configuration:
```javascript
{
    entry: {
        app: `webpack-polyfill-injector?${JSON.stringify({
            modules: [
                './your/first/module/for/this/entry.js',
                './your/second/module/for/this/entry.js'
            ]
        })}!`
    },
    output: {
        filename: `js/[name].js`,
        publicPath: '/'
    },
    plugins: [
        new PolyfillInjectorPlugin({
            polyfills: [
                'Promise',
                'Array.prototype.find',
            ]
        })
    ]
}
```

The loader creates this entry module in `js/app.js`:
```javascript
function main() {
    require('./your/first/module/for/this/entry.js');
    require('./your/second/module/for/this/entry.js');
}
var polyfills = function() {
    return [
        /* Promise */ ('Promise' in this) ? 0 : 1,
        /* Array.prototype.find */ ('find' in Array.prototype) ? 0 : 1
    ];
}.call(window);
if (polyfills.indexOf(1) === -1) {
    main();
} else {
    var js = document.createElement('script');
    js.src = "/js/polyfills." + polyfills.join('') + '.js';
    js.onload = main;
    js.onerror = function onError(message) {
        console.error('Could not load the polyfills: ' + message);
    };
    document.head.appendChild(js);
}
```

The plugin creates the files `js/polyfills.01.js` (containing the `Array.prototype.find` polyfill), `js/polyfills.10.js` (containing the `Promise` polyfill), and `js/polyfills.11.js` (containing both polyfills).

If a single polyfill file is created (`singleFile` option or only one polyfill specified), then the code generated by the loader simplifies:

```javascript
function main() {
    require('./your/first/module/for/this/entry.js');
    require('./your/second/module/for/this/entry.js');
}
if (function() {
    return /* Promise */ !('Promise' in this) ||
        /* Array.prototype.find */ !('find' in Array.prototype);
}.call(window)) {
    var js = document.createElement('script');
    js.src = "/js/polyfills.js";
    js.onload = main;
    js.onerror = function onError(message) {
        console.error('Could not load the polyfills: ' + message);
    };
    document.head.appendChild(js);
} else {
    main();
}
```

Note that in both cases, the detectors are wrapped in a function which is bound to `window`.
This is due to some detectors using `this` instead of `window`, e.g. `Promise` tests `'Promise' in this`.


[npm]: https://img.shields.io/npm/v/webpack-polyfill-injector.svg
[npm-url]: https://npmjs.com/package/webpack-polyfill-injector

[deps]: https://david-dm.org/SebastianS90/webpack-polyfill-injector.svg
[deps-url]: https://david-dm.org/SebastianS90/webpack-polyfill-injector

[test]: https://secure.travis-ci.org/SebastianS90/webpack-polyfill-injector.svg
[test-url]: http://travis-ci.org/SebastianS90/webpack-polyfill-injector

[coverage]: https://coveralls.io/repos/github/SebastianS90/webpack-polyfill-injector/badge.svg
[coverage-url]: https://coveralls.io/github/SebastianS90/webpack-polyfill-injector
