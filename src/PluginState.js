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
        this.publicPath = (undefined === compilation.options.output.publicPath) ? '' : compilation.options.output.publicPath;
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
        return this._filenames[newIndex] = this._calculateFilename(options, newIndex);
    }

    async _calculateFilename(options, index) {
        // The filename might include a hash, so we need the contents of all requested polyfills
        const sources = await Promise.all(
            options.polyfills.map(polyfill => this.getPolyfillSource(polyfill))
        );
        const content = concatSources(sources);
        return loaderUtils.interpolateName(
            {resourcePath: `./polyfills${index === 0 ? '' : '-' + index}.js`},
            options.filename,
            {content: content.source()}
        );
    }

    iteratePolyfillSets(iterator) {
        return Promise.all(
            this._requestedPolyfillSets.map(
                async (encoded, i) => {
                    const filename = await this._filenames[i];
                    return iterator(JSON.parse(encoded), filename);
                }
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
    return cache[key] = loader(key);
}

async function loadPolyfillSource(polyfill) { // eslint-disable-line require-await
    const file = require.resolve(`polyfill-service/polyfills/__dist/${polyfill}/raw.js`);
    return loadFileAsSource(file);
}

async function loadPolyfillMeta(polyfill) {
    const file = require.resolve(`polyfill-service/polyfills/__dist/${polyfill}/meta.json`);
    const content = await loadFileAsString(file);
    return JSON.parse(content);
}

async function loadPolyfillDetector(polyfill) {
    return (await loadPolyfillMeta(polyfill)).detectSource;
}

module.exports = PluginState;
