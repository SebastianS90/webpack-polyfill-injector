const
    RawSource = require('webpack-sources').RawSource,
    PluginState = require('./PluginState.js'),
    {getPolyfillsSource} = require('./library.js');

class PolyfillInjectorPlugin {
    constructor(options) {
        this.options = Object.assign({}, options);
    }

    apply(compiler) {
        compiler.hooks.invalid.tap('webpack-polyfill-injector', () => {
            compiler.__WebpackPolyfillInjectorInWatchRun = true;
        });

        compiler.hooks.thisCompilation.tap('webpack-polyfill-injector', (compilation) => {
            const pluginState = new PluginState(compilation, this.options);
            compilation.__WebpackPolyfillInjector = pluginState;

            compilation.hooks.additionalAssets.tapPromise('webpack-polyfill-injector', async () => {
                if (compiler.__WebpackPolyfillInjectorInWatchRun) {
                    // Nothing to do for successive compilations
                    return;
                }

                if (!pluginState.hasLoader) {
                    throw new Error('[webpack-polyfill-injector] The plugin must be used together with the loader!');
                }

                // Create the additional assets
                await pluginState.iteratePolyfillSets(
                    async ({polyfills, excludes, singleFile, banner}, filename) => {
                        if (singleFile) {
                            const source = await getPolyfillsSource(polyfills, excludes, polyfills.length === 1);
                            compilation.assets[filename] = new RawSource(banner + source);
                            addAsChunk(filename, compilation);
                        } else {
                            // Create one file for each possible subset of polyfills
                            const choices = Math.pow(2, polyfills.length);
                            const tasks = [];
                            for (let choiceId = 1; choiceId < choices; choiceId++) {
                                const choice = choiceId.toString(2).padStart(polyfills.length, '0');
                                const outputFile = filename.replace(/\.js$/, '.') + choice + '.js';
                                const currentPolyfills = polyfills.filter((polyfill, i) => choice.charAt(i) === '1');
                                const supported = polyfills.filter((polyfill, i) => choice.charAt(i) === '0');
                                tasks.push(
                                    getPolyfillsSource(currentPolyfills, excludes.concat(supported), true).then((source) => {
                                        compilation.assets[outputFile] = new RawSource(banner + source);
                                        addAsChunk(outputFile, compilation);
                                    })
                                );
                            }
                            await Promise.all(tasks);
                        }
                    }
                );
            });
        });
    }
}

function addAsChunk(filename, compilation) {
    const chunk = compilation.addChunk(null, null, null);
    chunk.ids = [];
    chunk.files.push(filename);
}

module.exports = PolyfillInjectorPlugin;
