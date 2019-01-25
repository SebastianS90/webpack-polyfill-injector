const
    loaderUtils = require('loader-utils'),
    {getPolyfillsSource} = require('./library.js');

class PluginState {
    constructor(compilation, options) {
        this._requestedPolyfillSets = [];
        this._filenames = {};
        this.defaultFilename = compilation.options.output.filename;
        this.defaultHashLength = compilation.options.output.hashDigestLength;
        this.publicPath = compilation.options.output.publicPath || '';
        this.options = options;
    }

    addPolyfills(options) {
        // Need a deterministic order and format of all options
        const encoded = JSON.stringify({
            banner: options.banner,
            polyfills: options.polyfills,
            excludes: options.excludes,
            singleFile: Boolean(options.singleFile),
            filename: options.filename,
        });
        const index = this._requestedPolyfillSets.indexOf(encoded);
        if (index >= 0) {
            return this._filenames[index];
        }
        const newIndex = this._requestedPolyfillSets.push(encoded) - 1;
        return this._filenames[newIndex] = getPolyfillsSource(options.polyfills, options.excludes, false).then(
            content => loaderUtils.interpolateName(
                {resourcePath: `./polyfills${newIndex === 0 ? '' : '-' + newIndex}.js`},
                formatFilename(options.filename, this.defaultHashLength),
                {content}
            ));
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
}

function formatFilename(filename, defaultHashLength) {
    return defaultHashLength
        ? filename.replace(/\[([^:]+:)?(?:chunk|content)hash(:[a-z]+\d*)?(:\d+)?\]/ig,
            (match, p1, p2, p3) => `[${p1 || ''}hash${p2 || ''}${p3 || ':' + defaultHashLength}]`)
        : filename.replace(/\[([^:]+:)?(?:chunk|content)hash(:[a-z]+\d*)?(:\d+)?\]/ig, '[$1hash$2$3]');
}

module.exports = PluginState;
