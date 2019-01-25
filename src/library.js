const polyfillLibrary = require('polyfill-library');

async function getPolyfillDetector(polyfill) {
    const meta = await polyfillLibrary.describePolyfill(polyfill);
    if (meta) {
        if (meta.detectSource) {
            return meta.detectSource;
        }
        throw new Error(`[webpack-polyfill-injector] The polyfill ${polyfill} does not have a detector! Consider sending a PR with a suitable detect.js file to polyfill-library.`);
    }
    throw new Error(`[webpack-polyfill-injector] The polyfill ${polyfill} does not exist!`);
}

function getPolyfillsSource(polyfills, excludes, requiresAll) {
    const flags = new Set(['always', 'gated']);
    const features = {};
    polyfills.forEach((polyfill) => {
        features[polyfill] = {flags};
    });
    if ('Promise.prototype.finally' in features && 'Promise' in features && requiresAll) {
        delete features['Promise.prototype.finally'];
    }
    return polyfillLibrary.getPolyfillString({
        minify: false,
        unknown: 'polyfill',
        features,
        excludes,
    });
}

module.exports = {
    getPolyfillDetector,
    getPolyfillsSource,
};
