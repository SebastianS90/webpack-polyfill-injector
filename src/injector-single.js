// Webpack Polyfill Injector
function main() {__MAIN__}
if (function() {
    return __TESTS__;
}.call(window)) {
    var js = document.createElement('script');
    js.src = __SRC__;
    js.onload = main;
    js.onerror = function onError(message) {
        console.error('Could not load the polyfills: ' + message);
    };
    document.head.appendChild(js);
} else {
    main();
}
