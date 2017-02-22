[![npm][npm]][npm-url]
[![deps][deps]][deps-url]
[![test][test]][test-url]

# Webpack Polyfill Injector Plugin
This plugin uses polyfills from [polyfill-service](https://github.com/Financial-Times/polyfill-service) and loads them if needed.

Instead of punishing all users with an additional HTTP request or increased script size, only browsers that do not implement all required features natively will load the polyfills from a separate file.

Webpack's internal chunk loading feature relies on `Promise` and therefore cannot be used to load a `Promise` polyfill. That is why this plugin implements its own loading logics.


## Install
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
  entry: {...},
  output: {...},
  module: {...},
  plugins: [
    new PolyfillInjectorPlugin([
      'Promise',
      'Array.prototype.find',
    ])
  ]
};
```

You can use any [polyfill from `polyfill-service`](https://github.com/Financial-Times/polyfill-service/tree/master/polyfills).


## Advanced Options
### Specify the polyfills filename
By default, we use the filename from webpack's `output.filename` setting with `[name]` replaced by `polyfills`. For example, if `output.filename` is `js/[name].[hash].js` then the polyfills will be written to `js/polyfills.0123456789abcdef.js`.

You can override the filename as follows:

```javascript
new PolyfillInjectorPlugin({
  polyfills: [
    'Promise',
    'Array.prototype.find',
  ],
  filename: 'some/path/polyfills.[hash:6].js',
})
```

### Use `polyfill.io` CDN
If you prefer to load polyfills directly from the `polyfill.io` CDN instead of putting a file into your bundle, then you can pass the following options:

```javascript
new PolyfillInjectorPlugin({
  polyfills: [
    'Promise',
    'Array.prototype.find',
  ],
  service: true,
})
```

If any specified polyfill is required, then the browser will load
`https://cdn.polyfill.io/v2/polyfill.min.js?features=Promise,Array.prototype.find`.

Note that `polyfill.io` only sends those polyfills that are required by the requesting browser.

### Use your own `polyfill-service` installation
If you want to benefit from only sending required polyfills but do not like to load scripts from the `polyfill.io` CDN, then you can use your own installation of `polyfill-service`:

```javascript
new PolyfillInjectorPlugin({
  polyfills: [
    'Promise',
    'Array.prototype.find',
  ],
  service: 'https://scripts.mydomain.example/polyfills.min.js',
})
```

Like above, `?features=Promise,Array.prototype.find` will be appended to the service URL.

### Specify any existing polyfill script
Do you already have a file with all required polyfills? Then you can use:

```javascript
new PolyfillInjectorPlugin({
  polyfills: [
    'Promise',
    'Array.prototype.find',
  ],
  service: 'https://static.mydomain.example/js/polyfills.js',
})
```

## Technical Details
The plugin wraps all entry chunks as follows:

```javascript
(function(main) {
  if (any specified polyfill is required) {
    var js = document.createElement('script');
    js.src = 'url to the polyfills script';
    js.onload = main;
    js.onerror = function() {
      console.error('Could not load polyfills script!');
      main();
    };
    document.head.appendChild(js);
  } else {
    main();
  }
}) (function() {
// your entry chunk (i.e. the original asset content) goes here...
});
```


[npm]: https://img.shields.io/npm/v/webpack-polyfill-injector.svg
[npm-url]: https://npmjs.com/package/webpack-polyfill-injector

[deps]: https://david-dm.org/SebastianS90/webpack-polyfill-injector.svg
[deps-url]: https://david-dm.org/SebastianS90/webpack-polyfill-injector

[test]: https://secure.travis-ci.org/SebastianS90/webpack-polyfill-injector.svg
[test-url]: http://travis-ci.org/SebastianS90/webpack-polyfill-injector
