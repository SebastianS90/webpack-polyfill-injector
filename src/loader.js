const
    fs = require('fs'),
    loaderUtils = require('loader-utils'),
    {getPolyfillDetector} = require('./library.js');

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
            polyfill => getPolyfillDetector(polyfill)
        ); // -> detectors
        tasks.push(pluginState.addPolyfills(options)); // -> outputFilename
        const templateFile = require.resolve(`./injector-${options.singleFile ? 'single' : 'multi'}.js`);
        tasks.push(new Promise((resolve, reject) => {
            fs.readFile(templateFile, {encoding: 'utf8'}, (err, data) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(data.trimRight());
                }
            });
        })); // -> template

        // Run all tasks and save the results
        const detectors = await Promise.all(tasks);
        const [outputFilename, template] = detectors.splice(polyfills.length, 2);

        // Construct the main module
        const injector = template
            .replace(
                '__MAIN__',
                options.modules.map(module => `\n    require(${loaderUtils.stringifyRequest(this, module)});`).join('') + '\n'
            )
            .replace(
                '__TESTS__',
                options.singleFile
                    ? polyfills.map((polyfill, i) => `/* ${polyfill} */ !(${detectors[i]})`).join(' ||\n        ')
                    : polyfills.map((polyfill, i) => `\n        /* ${polyfill} */ (${detectors[i]}) ? 0 : 1`).join(',') + '\n    '
            )
            .replace(
                '__SRC__',
                JSON.stringify(pluginState.publicPath + (
                    options.singleFile
                        ? outputFilename
                        : outputFilename.replace(/\.js$/, '.') // xxxx.js appended dynamically by injector
                ))
            );

        callback(null, injector, null); // eslint-disable-line callback-return
    } catch (error) {
        callback(error); // eslint-disable-line callback-return
    }
};

function getLoaderOptions(pluginState, loaderOptions) {
    const options = Object.assign(
        {
            banner: '/*! For detailed credits and licence information see https://github.com/financial-times/polyfill-library */\n',
            filename: pluginState.defaultFilename,
        },
        pluginState.options,
        loaderOptions
    );

    if (typeof options.modules === 'string') {
        options.modules = [options.modules];
    } else if (!Array.isArray(options.modules) || options.modules.length === 0) {
        throw new Error('[webpack-polyfill-injector] You need to specify the `modules` option!');
    }

    if (typeof options.polyfills === 'string') {
        options.polyfills = [options.polyfills];
    } else if (!Array.isArray(options.polyfills) || options.polyfills.length === 0) {
        throw new Error('[webpack-polyfill-injector] You need to specify the `polyfills` option!');
    }

    if (options.polyfills.length === 1) {
        options.singleFile = true;
    }

    // Sort & unique polyfills and excludes
    options.polyfills =
        [].concat(options.polyfills)
            .sort().filter((x, i, a) => i === 0 || x !== a[i - 1]);
    options.excludes =
        [].concat(options.excludes || [])
            .sort().filter((x, i, a) => i === 0 || x !== a[i - 1]);

    return options;
}
