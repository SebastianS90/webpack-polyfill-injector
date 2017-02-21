/* Polyfill Injector */
(function(main) {
    if(true || __TEST__) {
        var js = document.createElement('script');
        js.src = __SRC__;
        js.onload = main;
        js.onerror = function() {
            console.error('Could not load polyfills script!');
            main();
        };
        document.head.appendChild(js);
    } else {
        main();
    }
})
