const
    OriginalSource = require('webpack-sources').OriginalSource,
    ReplaceSource = require('webpack-sources').ReplaceSource,
    ConcatSource = require('webpack-sources').ConcatSource,
    PrefixSource = require('webpack-sources').PrefixSource,
    CachedSource = require('webpack-sources').CachedSource,
    loaderUtils = require('loader-utils'),
    _ = require('lodash'),
    fs = require('fs');


function PolyfillInjectorPlugin(arg) {
    // Allow to pass an array as argument
    const config = Array.isArray(arg)
        ? {polyfills: arg}
        : arg;

    // Ensure that we have at least one polyfill
    if (!config || !config.polyfills || !config.polyfills.length) {
        throw new Error('No polyfills specified!');
    }
    this.polyfills = config.polyfills.map(polyfill => polyfill.replace(/\./g, '/'));

    if (config.service) {
        // Use a hosted polyfill-service
        this.service = true;
        this.src = typeof config.service === 'string'
            ? config.service
            : 'https://cdn.polyfill.io/v2/polyfill.min.js';
    } else if (config.src) {
        // Use a static URL
        this.src = config.src;
    } else {
        // Bundle the polyfills and serve them from outputPath
        this.filename = config.filename;
    }
}

function loadFileAsSource(file) {
    const resolvedFile = require.resolve(file);
    return new OriginalSource(
        fs.readFileSync(resolvedFile, {encoding: 'utf8'}).trimRight(),
        resolvedFile
    );
}

function loadFileAsString(file) {
    const resolvedFile = require.resolve(file);
    return fs.readFileSync(resolvedFile, {encoding: 'utf8'}).trim();
}

function buildInjector(polyfills, src) {
    const injectorRaw = loadFileAsSource('./injector.js');
    const injector = new ReplaceSource(injectorRaw);

    // Replace __TEST__
    const testPosition = injectorRaw.source().indexOf('__TEST__');
    injector.replace(testPosition, testPosition + 7,
        polyfills.map(polyfill =>
            `/* ${polyfill.replace(/\//g, '.')} */!(` +
            loadFileAsString(`polyfill-service/polyfills/${polyfill}/detect.js`) +
            ')'
        ).join('\n    || ')
    );

    // Replace __SRC__
    const srcPosition = injectorRaw.source().indexOf('__SRC__');
    injector.replace(srcPosition, srcPosition + 6, JSON.stringify(src));

    return injector;
}

PolyfillInjectorPlugin.prototype.apply = function apply(compiler) {
    compiler.plugin('this-compilation', (compilation) => {
        let src = '';
        if (this.service) {
            src = this.src + '?features=' + this.polyfills
                .map(polyfill => encodeURIComponent(polyfill.replace(/\//g, '.')))
                .join(',');
        } else if (this.src) {
            src = this.src;
        } else {
            // Construct the bundled polyfills file
            const content = new CachedSource(
                _.flatMap(this.polyfills, polyfill => [
                    `/* ${polyfill.replace(/\//g, '.')} */\nif (!(`,
                    loadFileAsSource(`polyfill-service/polyfills/${polyfill}/detect.js`),
                    ')) {\n',
                    new PrefixSource(
                        '\t',
                        loadFileAsSource(`polyfill-service/polyfills/${polyfill}/polyfill.js`)
                    ),
                    '\n}\n\n',
                ]).reduce((concatSource, entry) => {
                    concatSource.add(entry);
                    return concatSource;
                }, new ConcatSource(
                    '/*! For detailed credits and licence information see ' +
                    'https://github.com/financial-times/polyfill-service. */\n'
                ))
            );
            content.__PolyfillInjectorPlugin = true;

            // Determine the output file
            const file = loaderUtils.interpolateName(
                {resourcePath: './polyfills.js'},
                this.filename || compilation.options.output.filename,
                {content: content.source()}
            );
            src = compilation.options.output.publicPath + file;

            // Add the file as asset for all entry chunks
            compilation.plugin('additional-chunk-assets', (chunks) => {
                compilation.assets[file] = content;
                chunks.forEach((chunk) => {
                    if (chunk.hasEntryModule()) {
                        chunk.files.push(file);
                    }
                });
            });
        }

        // Inject the script to load our polyfill file
        const injector = buildInjector(this.polyfills, src);
        compilation.plugin('optimize-chunk-assets', (chunks, callback) => {
            chunks.forEach((chunk) => {
                if (!chunk.hasEntryModule()) {
                    return;
                }
                chunk.files.forEach((file) => {
                    if (!file.endsWith('.js') ||
                        compilation.assets[file].__PolyfillInjectorPlugin
                    ) {
                        return;
                    }

                    // (function(main) {
                    //   load polyfills if needed, then execute main()
                    // }) (function() { normal application code goes here... });
                    const source = new ConcatSource(
                        injector,
                        '(function() {\n',
                        compilation.assets[file],
                        '\n});'
                    );
                    source.__PolyfillInjectorPlugin = true;
                    compilation.assets[file] = source;
                });
            });
            callback();
        });
    });
};

module.exports = PolyfillInjectorPlugin;
