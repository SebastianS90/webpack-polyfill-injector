/* global Promise */
const
    loaderUtils = require('loader-utils'),
    CachedSource = require('webpack-sources').CachedSource,
    ReplaceSource = require('webpack-sources').ReplaceSource,
    {getLoaderOptions, loadFileAsSource} = require('./helpers.js');

module.exports = function loader(content, map, meta) {
    // Object shared with the plugin
    if (!Object.prototype.hasOwnProperty.call(this._compilation, '__POLYFILL_INJECTOR')) {
        throw new Error('[webpack-polyfill-injector] The loader must be used together with the plugin!');
    }
    const pluginState = this._compilation.__POLYFILL_INJECTOR;

    // Options
    const options = getLoaderOptions(pluginState, loaderUtils.getOptions(this));
    const polyfills = options.polyfills;
    const modules = options.modules;

    // Loader settings
    this.cacheable();
    const loaderCallback = this.async();

    // Start doing the work...
    pluginState
        .addPolyfills(options)
        .then(outputFilename =>
            Promise.all(
                // Load all detectors
                polyfills.map(
                    polyfill => pluginState.getPolyfillDetector(polyfill)
                ).concat(
                    // and the injector template
                    loadFileAsSource(
                        require.resolve(`./injector-${options.singleFile ? 'single' : 'multi'}.js`)
                    )
                )
            ).then((polyfillTests) => {
                // The injector template is the last element of that array
                const injectorRaw = polyfillTests.splice(polyfills.length)[0];

                // Construct the main module
                const vars = {
                    __MAIN__: modules.map(module => `\n    require(${loaderUtils.stringifyRequest(this, module)});`).join('') + '\n',
                    __TESTS__: options.singleFile
                        ? polyfills.map((polyfill, i) => `/* ${polyfill} */ !(${polyfillTests[i]})`).join(' ||\n        ')
                        : polyfills.map((polyfill, i) => `\n        /* ${polyfill} */ (${polyfillTests[i]}) ? 0 : 1`).join(',') + '\n    ',
                    __SRC__: JSON.stringify(pluginState.publicPath + (
                        options.singleFile
                            ? outputFilename
                            : outputFilename.replace(/\.js$/, '.') // xxxx.js appended dynamically by injector
                    )),
                };
                const injector = new ReplaceSource(injectorRaw);
                for (const key in vars) {
                    if (Object.prototype.hasOwnProperty.call(vars, key)) {
                        const pos = injectorRaw.source().indexOf(key);
                        injector.replace(pos, pos + key.length - 1, vars[key]);
                    }
                }
                return new CachedSource(injector);
            })
        ).then(
            (source) => {
                loaderCallback(null, source.source(), source.map());
            },
            (error) => {
                loaderCallback(error);
            }
        );
};
