const
    ConcatSource = require('webpack-sources').ConcatSource,
    PrefixSource = require('webpack-sources').PrefixSource,
    CachedSource = require('webpack-sources').CachedSource,
    PluginState = require('./PluginState.js');

class PolyfillInjectorPlugin {
    constructor(options) {
        this.options = Object.assign({}, options);
    }

    apply(compiler) {
        compiler.plugin('invalid', () => {
            compiler.__WebpackPolyfillInjectorInWatchRun = true;
        });

        compiler.plugin('this-compilation', (compilation) => {
            const pluginState = new PluginState(compilation, this.options);
            compilation.__WebpackPolyfillInjector = pluginState;

            compilation.plugin('additional-assets', async (callback) => {
                try {
                    if (compiler.__WebpackPolyfillInjectorInWatchRun) {
                        // Nothing to do for successive compilations
                        callback();
                        return;
                    }

                    if (!pluginState.hasLoader) {
                        throw new Error('[webpack-polyfill-injector] The plugin must be used together with the loader!');
                    }

                    // Create the additional assets
                    await pluginState.iteratePolyfillSets(
                        async ({polyfills, singleFile, banner}, filename) => {
                            // Load all polyfill sources
                            const tasks = polyfills.map(polyfill => pluginState.getPolyfillSource(polyfill));
                            if (singleFile && polyfills.length > 1) {
                                // and the detectors if we are creating a single file that contains multiple polyfills
                                tasks.push(...polyfills.map(polyfill => pluginState.getPolyfillDetector(polyfill)));
                            }

                            // Run all tasks and split the results into their appropriate arrays
                            const polyfillSources = await Promise.all(tasks);
                            const polyfillDetectors = polyfillSources.splice(polyfills.length);

                            if (singleFile) {
                                // Create one file containing all requested polyfills
                                compilation.assets[filename] = constructFile(
                                    polyfills.length > 1,
                                    banner,
                                    polyfills,
                                    polyfillSources,
                                    polyfillDetectors
                                );
                                addAsChunk(filename, compilation);
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
                                    addAsChunk(outputFile, compilation);
                                }
                            }
                        }
                    );
                    callback(); // eslint-disable-line callback-return
                } catch (error) {
                    callback(error); // eslint-disable-line callback-return
                }
            });
        });
    }
}

function constructFile(withTests, banner, polyfills, polyfillSources, polyfillDetectors, choice) {
    return withTests
        ? constructFileWithTests(banner, polyfills, polyfillSources, polyfillDetectors, choice)
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

function constructFileWithTests(banner, polyfills, polyfillSources, polyfillDetectors, choice) {
    const source = new ConcatSource(banner || '');
    polyfills.forEach((polyfill, i) => {
        if (!choice || choice.charAt(i) === '1') {
            // source.add(`\n// ${polyfill}\nif(!(${polyfillDetectors[i]})) {\n`);
            source.add(`\nif(!(${polyfillDetectors[i]})) {\n`);
            source.add(new PrefixSource('    ', polyfillSources[i]));
            source.add('\n}\n');
        }
    });
    return new CachedSource(source);
}

function addAsChunk(filename, compilation) {
    const chunk = compilation.addChunk(null, null, null);
    chunk.ids = [];
    chunk.files.push(filename);
}

module.exports = PolyfillInjectorPlugin;
