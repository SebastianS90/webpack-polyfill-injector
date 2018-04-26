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
                    async ({polyfills, singleFile, banner}, filename) => {
                        // Load all polyfill sources and meta data
                        const tasks = polyfills.map(polyfill => pluginState.getPolyfillSource(polyfill));
                        tasks.push(...polyfills.map(polyfill => pluginState.getPolyfillMeta(polyfill)));

                        // Run all tasks and split the results into their appropriate arrays
                        const polyfillSources = await Promise.all(tasks);
                        const polyfillMetas = polyfillSources.splice(polyfills.length);

                        // Collect internal dependencies (i.e. polyfills whose names start with underscore)
                        const dependencySources = {};
                        async function resolveDependencies(dependencies, fetched) {
                            const deps = dependencies.filter(d => d.startsWith('_') && !fetched.includes(d));
                            const tasks = deps.map(dep => pluginState.getPolyfillSource(dep));
                            tasks.push(...deps.map(dep => pluginState.getPolyfillMeta(dep)));
                            const depsSources = await Promise.all(tasks);
                            const depsMetas = depsSources.splice(deps.length);
                            deps.forEach((dep, i) => {
                                dependencySources[dep] = depsSources[i];
                            });
                            fetched.push(...deps);
                            const recursiveDeps = await Promise.all(
                                depsMetas.map(meta => resolveDependencies(meta.dependencies || [], fetched))
                            );
                            return [].concat(deps, ...recursiveDeps);
                        }
                        const polyfillDependencies = await Promise.all(
                            polyfillMetas.map(meta => resolveDependencies(meta.dependencies || [], []))
                        );

                        if (singleFile) {
                            // Create one file containing all requested polyfills
                            compilation.assets[filename] = constructFile(
                                polyfills.length > 1,
                                banner,
                                polyfills,
                                polyfillSources,
                                polyfillMetas.map(meta => meta.detectSource),
                                polyfillDependencies,
                                dependencySources
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
                                    polyfillDependencies,
                                    dependencySources,
                                    choice
                                );
                                addAsChunk(outputFile, compilation);
                            }
                        }
                    }
                );
            });
        });
    }
}

function constructFile(withTests, banner, polyfills, polyfillSources, polyfillDetectors, polyfillDependencies, dependencySources, choice) {
    return withTests
        ? constructFileWithTests(banner, polyfills, polyfillSources, polyfillDetectors, polyfillDependencies, dependencySources, choice)
        : constructFileWithoutTests(banner, polyfills, polyfillSources, polyfillDependencies, dependencySources, choice);
}

function constructFileWithoutTests(banner, polyfills, polyfillSources, polyfillDependencies, dependencySources, choice) {
    const source = new ConcatSource(banner || '');
    source.add(constructDependencies(polyfills, polyfillDependencies, dependencySources, choice));
    polyfills.forEach((polyfill, i) => {
        if (!choice || choice.charAt(i) === '1') {
            source.add('\n');
            source.add(polyfillSources[i]);
            source.add('\n');
        }
    });
    return new CachedSource(source);
}

function constructFileWithTests(banner, polyfills, polyfillSources, polyfillDetectors, polyfillDependencies, dependencySources, choice) {
    const source = new ConcatSource(banner || '');
    source.add(constructDependencies(polyfills, polyfillDependencies, dependencySources, choice));
    polyfills.forEach((polyfill, i) => {
        if (!choice || choice.charAt(i) === '1') {
            source.add(`\nif(!(${polyfillDetectors[i]})) {\n`);
            source.add(new PrefixSource('    ', polyfillSources[i]));
            source.add('\n}\n');
        }
    });
    return new CachedSource(source);
}

function constructDependencies(polyfills, polyfillDependencies, dependencySources, choice) {
    const dependencies = [];
    polyfills.forEach((polyfill, i) => {
        if (!choice || choice.charAt(i) === '1') {
            polyfillDependencies[i].forEach((dep) => {
                if (!dependencies.includes(dep)) {
                    dependencies.push(dep);
                }
            });
        }
    });
    const source = new ConcatSource();
    dependencies.forEach((dep) => {
        source.add(dependencySources[dep]);
        source.add('\n');
    });
    return source;
}

function addAsChunk(filename, compilation) {
    const chunk = compilation.addChunk(null, null, null);
    chunk.ids = [];
    chunk.files.push(filename);
}

module.exports = PolyfillInjectorPlugin;
