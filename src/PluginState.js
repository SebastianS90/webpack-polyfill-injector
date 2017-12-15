/* global Promise */
const
    loaderUtils = require('loader-utils'),
    {concatSources, loadFileAsString, loadFileAsSource} = require('./helpers.js');

class PluginState {
    constructor(compilation, options) {
        this._requestedPolyfillSets = [];
        this._filenames = {};
        this._polyfillCache = {};
        this._detectorCache = {};
        this.defaultFilename = compilation.options.output.filename.replace(/([[:])chunkhash([\]:])/, '$1hash$2');
        this.publicPath = compilation.options.output.publicPath;
        this.options = options;
    }

    addPolyfills(options) {
        // Need a deterministic order and format of all options
        const encoded = JSON.stringify({
            banner: options.banner,
            polyfills: options.polyfills,
            singleFile: Boolean(options.singleFile),
            filename: options.filename,
        });
        const index = this._requestedPolyfillSets.indexOf(encoded);
        if (index >= 0) {
            return this._filenames[index];
        }
        const newIndex = this._requestedPolyfillSets.push(encoded) - 1;

        // The filename might include a hash, so we need the contents of all requested polyfills
        return this._filenames[newIndex] = Promise.all(
            options.polyfills.map(polyfill => this.getPolyfillSource(polyfill))
        ).then(
            sources => concatSources(sources)
        ).then(
            content => loaderUtils.interpolateName(
                {resourcePath: `./polyfills${newIndex === 0 ? '' : '-' + newIndex}.js`},
                options.filename,
                {content: content.source()}
            )
        );
    }

    iteratePolyfillSets(iterator) {
        return this._requestedPolyfillSets.map(
            (encoded, i) => this._filenames[i].then(
                filename => iterator(JSON.parse(encoded), filename)
            )
        );
    }

    getPolyfillSource(polyfill) {
        return loadCache(polyfill, this._polyfillCache, loadPolyfillSource);
    }

    getPolyfillDetector(polyfill) {
        return loadCache(polyfill, this._detectorCache, loadPolyfillDetector);
    }
}

function loadCache(key, cache, loader) {
    if (Object.prototype.hasOwnProperty.call(cache, key)) {
        return cache[key];
    }
    try {
        return cache[key] = loader(key);
    } catch (e) {
        return cache[key] = Promise.reject(e);
    }
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
        .then(meta => meta.detectSource);
}

module.exports = PluginState;
