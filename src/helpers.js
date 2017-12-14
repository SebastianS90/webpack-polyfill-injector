/* global Promise */
const
    fs = require('fs'),
    ConcatSource = require('webpack-sources').ConcatSource,
    OriginalSource = require('webpack-sources').OriginalSource;

function getLoaderOptions(pluginState, loaderOptions) {
    const options = Object.assign(
        {
            banner: '/*! For detailed credits and licence information see https://github.com/financial-times/polyfill-service */\n',
            filename: pluginState.defaultFilename,
        },
        pluginState.options,
        loaderOptions
    );

    if (!Array.isArray(options.polyfills) || options.polyfills.length === 0 ||
        !Array.isArray(options.modules) || options.modules.length === 0
    ) {
        throw new Error('[webpack-polyfill-injector] You need to specify non-empty arrays for the `polyfills` and `modules` options!');
    }

    if (options.polyfills.length === 1) {
        options.singleFile = true;
    }

    return options;
}

function concatSources(sources) {
    if (sources.length === 1) {
        return sources[0];
    }
    const concatSource = new ConcatSource();
    sources.forEach(source => concatSource.add(source));
    return concatSource;
}

function loadFileAsString(file) {
    return new Promise((resolve, reject) => {
        fs.readFile(file, {encoding: 'utf8'}, (err, data) => {
            if (err) {
                reject(err);
            } else {
                resolve(data);
            }
        });
    });
}

function loadFileAsSource(file) {
    return loadFileAsString(file)
        .then(data => new OriginalSource(
            data.trimRight(),
            file
        ));
}

function loadPolyfillSource(polyfill) {
    return loadFileAsSource(
        require.resolve(`polyfill-service/polyfills/__dist/${polyfill}/raw.js`)
    );
}

function loadPolyfillMeta(polyfill) {
    return loadFileAsString(
        require.resolve(`polyfill-service/polyfills/__dist/${polyfill}/meta.json`)
    ).then(data => JSON.parse(data));
}

function loadPolyfillDetector(polyfill) {
    return loadPolyfillMeta(polyfill)
        .then(meta => meta.detectionSource);
}

module.exports = {
    getLoaderOptions,
    concatSources,
    loadFileAsString,
    loadFileAsSource,
    loadPolyfillSource,
    loadPolyfillMeta,
    loadPolyfillDetector,
};
