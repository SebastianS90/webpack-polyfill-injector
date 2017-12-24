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

async function loadFileAsSource(file) {
    const data = await loadFileAsString(file);
    return new OriginalSource(
        data.trimRight(),
        file
    );
}

module.exports = {
    getLoaderOptions,
    concatSources,
    loadFileAsString,
    loadFileAsSource,
};
