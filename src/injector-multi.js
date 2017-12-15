// Webpack Polyfill Injector
function main() {__MAIN__}
var polyfills = function() {
    return [__TESTS__];
}.call(window);
if (polyfills.indexOf(1) === -1) {
    main();
} else {
    var js = document.createElement('script');
    js.src = __SRC__ + polyfills.join('') + '.js';
    js.onload = main;
    js.onerror = function onError(message) {
        console.error('Could not load the polyfills: ' + message);
    };
    document.head.appendChild(js);
}
