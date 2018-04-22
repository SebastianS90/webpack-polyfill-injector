const
    loaderUtils = require('loader-utils'),
    CachedSource = require('webpack-sources').CachedSource,
    ReplaceSource = require('webpack-sources').ReplaceSource,
    {getLoaderOptions, loadFileAsSource} = require('./helpers.js');

module.exports = async function loader(content, map, meta) {
    this.cacheable();
    const callback = this.async();
    try {
        // Object shared with the plugin
        if (!Object.prototype.hasOwnProperty.call(this._compilation, '__WebpackPolyfillInjector')) {
            throw new Error('[webpack-polyfill-injector] The loader must be used together with the plugin!');
        }
        const pluginState = this._compilation.__WebpackPolyfillInjector;
        pluginState.hasLoader = true;

        // Options
        const options = getLoaderOptions(pluginState, loaderUtils.getOptions(this));
        const polyfills = options.polyfills;

        // Collect all tasks that will be run concurrently.
        const tasks = polyfills.map(
            polyfill => pluginState.getPolyfillMeta(polyfill)
        ); // -> detectors
        tasks.push(pluginState.addPolyfills(options)); // -> outputFilename
        tasks.push(loadFileAsSource(
            require.resolve(`./injector-${options.singleFile ? 'single' : 'multi'}.js`)
        )); // -> template

        // Run all tasks and save the results
        const results = await Promise.all(tasks);
        const [outputFilename, template] = results.splice(polyfills.length, 2);
        const detectors = results.map(meta => meta.detectSource);

        // Construct the main module
        const source = constructMainModule(
            options.modules, polyfills, detectors,
            template, outputFilename, options.singleFile,
            this, pluginState
        );
        callback(null, source.source(), source.map()); // eslint-disable-line callback-return
    } catch (error) {
        callback(error); // eslint-disable-line callback-return
    }
};

function constructMainModule(modules, polyfills, detectors, template, outputFilename, singleFile, loaderContext, pluginState) {
    const vars = {
        __MAIN__: modules.map(module => `\n    require(${loaderUtils.stringifyRequest(loaderContext, module)});`).join('') + '\n',
        __TESTS__: singleFile
            ? polyfills.map((polyfill, i) => `/* ${polyfill} */ !(${detectors[i]})`).join(' ||\n        ')
            : polyfills.map((polyfill, i) => `\n        /* ${polyfill} */ (${detectors[i]}) ? 0 : 1`).join(',') + '\n    ',
        __SRC__: JSON.stringify(pluginState.publicPath + (
            singleFile
                ? outputFilename
                : outputFilename.replace(/\.js$/, '.') // xxxx.js appended dynamically by injector
        )),
    };
    const injector = new ReplaceSource(template);
    for (const key in vars) {
        if (Object.prototype.hasOwnProperty.call(vars, key)) {
            const pos = template.source().indexOf(key);
            injector.replace(pos, pos + key.length - 1, vars[key]);
        }
    }
    return new CachedSource(injector);
}
