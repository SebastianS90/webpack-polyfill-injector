/* global Promise */
const
    ConcatSource = require('webpack-sources').ConcatSource,
    PrefixSource = require('webpack-sources').PrefixSource,
    CachedSource = require('webpack-sources').CachedSource,
    loaderUtils = require('loader-utils'),
    PluginState = require('./PluginState.js'),
    {getLoaderOptions} = require('./helpers.js');

class PolyfillInjectorPlugin {
    constructor(options) {
        this.options = Object.assign({}, options);
    }

    apply(compiler) {
        compiler.plugin('this-compilation', (compilation) => {
            const pluginState = new PluginState(compilation, this.options);
            compilation.__POLYFILL_INJECTOR = pluginState;

            compilation.plugin('additional-assets', (callback) => {
                if (!pluginState.hasLoader) {
                    callback(new Error('[webpack-polyfill-injector] The plugin must be used together with the loader!'));
                    return;
                }

                // Get all chunks that contain modules from our loader
                const chunksWithSingleInjector = {};
                const chunksWithMultiInjector = {};
                try {
                    const loaderPrefix = require.resolve('./loader.js') + '?';
                    compilation.chunks.forEach((chunk) => {
                        chunk.forEachModule((module) => {
                            if (module.request) {
                                module.request.split('!').forEach((request) => {
                                    if (request.startsWith(loaderPrefix)) {
                                        const options = getLoaderOptions(
                                            pluginState,
                                            loaderUtils.parseQuery(request.substr(loaderPrefix.length - 1))
                                        );
                                        const encoded = JSON.stringify(options.polyfills);
                                        const store = options.singleFile
                                            ? chunksWithSingleInjector
                                            : chunksWithMultiInjector;
                                        if (Object.prototype.hasOwnProperty.call(store, encoded)) {
                                            if (!store[encoded].includes(chunk)) {
                                                store[encoded].push(chunk);
                                            }
                                        } else {
                                            store[encoded] = [chunk];
                                        }
                                    }
                                });
                            }
                        });
                    });
                } catch (err) {
                    callback(err);
                    return;
                }

                // Create the additional assets
                Promise.all(
                    pluginState.iteratePolyfillSets(({polyfills, singleFile, banner}, filename) =>
                        Promise.all(
                            // Load all polyfill sources
                            polyfills.map(
                                polyfill => pluginState.getPolyfillSource(polyfill)
                            ).concat(
                                // and the detectors if we are creating a single file
                                // that contains multiple polyfills
                                singleFile && polyfills.length > 1
                                    ? polyfills.map(polyfill => pluginState.getPolyfillDetector(polyfill))
                                    : []
                            )
                        ).then((polyfillSources) => {
                            // Move the tests to a separate array
                            const polyfillTests = polyfillSources.splice(polyfills.length);
                            const polyfillsString = JSON.stringify(polyfills);

                            if (singleFile) {
                                // Create one file containing all requested polyfills
                                compilation.assets[filename] = constructFile(
                                    polyfills.length > 1,
                                    banner,
                                    polyfills,
                                    polyfillSources,
                                    polyfillTests
                                );
                                chunksWithSingleInjector[polyfillsString].forEach((chunk) => {
                                    chunk.files.push(filename);
                                });
                            } else {
                                // Create one file for each possible subset of polyfills
                                const choices = Math.pow(2, polyfills.length);
                                for (let choiceId = 1; choiceId < choices; choiceId++) {
                                    const choice = choiceId.toString(2).padStart(polyfills.length, '0');
                                    const outputFile = filename.replace(/\.js$/, '.') + choice + '.js';
                                    compilation.assets[outputFile] = constructFileWithoutTests(
                                        banner,
                                        polyfills,
                                        polyfillSources,
                                        choice
                                    );
                                    chunksWithMultiInjector[polyfillsString].forEach((chunk) => {
                                        chunk.files.push(outputFile);
                                    });
                                }
                            }
                        }))
                ).then(
                    () => {
                        callback();
                    },
                    (error) => {
                        callback(error);
                    }
                );
            });
        });
    }
}

function constructFile(withTests, banner, polyfills, polyfillSources, polyfillTests, choice) {
    return withTests
        ? constructFileWithTests(banner, polyfills, polyfillSources, polyfillTests, choice)
        : constructFileWithoutTests(banner, polyfills, polyfillSources, choice);
}

function constructFileWithoutTests(banner, polyfills, polyfillSources, choice) {
    const source = new ConcatSource(banner || '');
    polyfills.forEach((polyfill, i) => {
        if (!choice || choice.charAt(i) === '1') {
            // source.add(`\n// ${polyfill}\n`);
            source.add('\n');
            source.add(polyfillSources[i]);
            source.add('\n');
        }
    });
    return new CachedSource(source);
}

function constructFileWithTests(banner, polyfills, polyfillSources, polyfillTests, choice) {
    const source = new ConcatSource(banner || '');
    polyfills.forEach((polyfill, i) => {
        if (!choice || choice.charAt(i) === '1') {
            // source.add(`\n// ${polyfill}\nif(!(${polyfillTests[i]})) {\n`);
            source.add(`\nif(!(${polyfillTests[i]})) {\n`);
            source.add(new PrefixSource('    ', polyfillSources[i]));
            source.add('\n}\n');
        }
    });
    return new CachedSource(source);
}

module.exports = PolyfillInjectorPlugin;
