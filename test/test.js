/* global Promise */
const
    _ = require('lodash'),
    path = require('path'),
    chai = require('chai'),
    MemoryFS = require('memory-fs'),
    {JSDOM} = require('jsdom'),
    webpack = require('webpack'),
    PolyfillInjectorPlugin = require('../src/plugin.js');

chai.use(require('dirty-chai'));
chai.use(require('chai-as-promised'));
const expect = chai.expect;

const webpackConfig = {
    output: {
        path: '/',
        publicPath: '/',
        filename: '[name].js',
    },
    resolveLoader: {
        alias: {
            'webpack-polyfill-injector': path.resolve(__dirname, '..'),
        },
    },
};

function compile(options) {
    return new Promise((resolve, reject) => {
        const config = _.merge({}, webpackConfig, options);
        const compiler = webpack(config);
        const fs = new MemoryFS();
        compiler.outputFileSystem = fs;
        compiler.run((err, stats) => {
            if (err) {
                reject(err);
            } else if (stats.compilation.errors.length > 0) {
                reject(stats.compilation.errors[0]);
            } else {
                resolve({fs, stats});
            }
        });
    });
}

async function test(options) {
    const testHooks = Object.assign({
        executeBundle() {
            return true;
        },
        executePolyfills() {
            return true;
        },
    }, options.testHooks);
    delete options.testHooks;

    const {fs, stats} = await compile(options);
    const app = fs.readFileSync('/app.js', 'utf-8');
    const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', {
        runScripts: 'outside-only',
    });
    const window = dom.window;
    const state = {fs, stats, dom, window, app};

    if (testHooks.executeBundle(state) === false) {
        return state;
    }

    window.eval(app);

    const scripts = window.document.head.getElementsByTagName('script');
    if (scripts.length > 0) {
        state.polyfillsUrl = scripts[0].src;
        state.polyfillsFile = fs.readFileSync(state.polyfillsUrl, 'utf-8');

        if (testHooks.executePolyfills(state) === false) {
            return state;
        }

        window.eval(state.polyfillsFile);
        window.eval(`window.document.head.getElementsByTagName('script')[0].onload()`);
    }

    return state;
}

describe('webpack-polyfill-injector', () => {
    describe('When requesting a single polyfill', () => {
        describe('and the browser does not implement that feature natively', () => {
            let state; // eslint-disable-line init-declarations
            before(async () => {
                state = await test({
                    entry: {app: 'webpack-polyfill-injector?{modules:["./test/fixtures/simple.js"]}!'},
                    plugins: [new PolyfillInjectorPlugin({polyfills: ['Promise']})],
                    testHooks: {
                        executeBundle({window}) {
                            window.eval('delete window.Promise');
                        },
                    },
                });
            });

            it('creates two assets: app.js and polyfills.js', () => {
                const assets = state.stats.compilation.assets;
                expect(Object.keys(assets)).to.have.lengthOf(2);
                expect(assets).to.have.property('app.js');
                expect(assets).to.have.property('polyfills.js');
            });

            it('does not guard the polyfill', () => {
                expect(state.polyfillsFile).to.not.contain(`'Promise' in this`);
            });

            it('loads the polyfill', () => {
                expect(state.window).to.have.property('Promise');
            });

            it('executes the entry module', () => {
                expect(state.dom.serialize()).to.contain('---SUCCESS---');
            });
        });

        describe('and the browser supports that feature natively', () => {
            let state; // eslint-disable-line init-declarations
            before(async () => {
                state = await test({
                    entry: {app: 'webpack-polyfill-injector?{modules:["./test/fixtures/simple.js"]}!'},
                    plugins: [new PolyfillInjectorPlugin({polyfills: ['Promise']})],
                });
            });

            it('does not load the polyfill', () => {
                expect(state.polyfillsUrl).to.be.undefined();
            });

            it('executes the entry module', () => {
                expect(state.dom.serialize()).to.contain('---SUCCESS---');
            });
        });
    });


    describe('When requesting two polyfills with singleFile option', () => {
        describe('and the browser supports only one of both features natively', () => {
            let state; // eslint-disable-line init-declarations
            before(async () => {
                state = await test({
                    entry: {app: 'webpack-polyfill-injector?{modules:["./test/fixtures/simple.js"]}!'},
                    plugins: [new PolyfillInjectorPlugin({polyfills: ['Promise', 'Array.prototype.find'], singleFile: true})],
                    testHooks: {
                        executeBundle({window}) {
                            window.eval('delete window.Promise');
                        },
                    },
                });
            });

            it('creates two assets: app.js and polyfills.js', () => {
                const assets = state.stats.compilation.assets;
                expect(Object.keys(assets)).to.have.lengthOf(2);
                expect(assets).to.have.property('app.js');
                expect(assets).to.have.property('polyfills.js');
            });

            it('puts both polyfills into the same file', () => {
                expect(state.polyfillsFile).to.contain('Promise');
                expect(state.polyfillsFile).to.contain('Array.prototype.find');
            });

            it('guards the polyfills', () => {
                expect(state.polyfillsFile).to.contain(`if(!('Promise' in this))`);
                expect(state.polyfillsFile).to.contain(`if(!('find' in Array.prototype))`);
            });

            it('loads the polyfill', () => {
                expect(state.window).to.have.property('Promise');
            });

            it('executes the entry module', () => {
                expect(state.dom.serialize()).to.contain('---SUCCESS---');
            });
        });

        describe('and the browser supports both features natively', () => {
            let state; // eslint-disable-line init-declarations
            before(async () => {
                state = await test({
                    entry: {app: 'webpack-polyfill-injector?{modules:["./test/fixtures/simple.js"]}!'},
                    plugins: [new PolyfillInjectorPlugin({polyfills: ['Promise']})],
                });
            });

            it('does not load the polyfills', () => {
                expect(state.polyfillsUrl).to.be.undefined();
            });

            it('executes the entry module', () => {
                expect(state.dom.serialize()).to.contain('---SUCCESS---');
            });
        });
    });


    describe('When requesting two polyfills (without singleFile option)', () => {
        describe('and the browser supports only one of both features natively', () => {
            let state; // eslint-disable-line init-declarations
            before(async () => {
                state = await test({
                    entry: {app: 'webpack-polyfill-injector?{modules:["./test/fixtures/simple.js"]}!'},
                    plugins: [new PolyfillInjectorPlugin({polyfills: ['Promise', 'Array.prototype.find']})],
                    testHooks: {
                        executeBundle({window}) {
                            window.eval('delete window.Promise');
                        },
                    },
                });
            });

            it('creates four assets: app.js and polyfills.{01|10|11}.js', () => {
                const assets = state.stats.compilation.assets;
                expect(Object.keys(assets)).to.have.lengthOf(4);
                expect(assets).to.have.property('app.js');
                expect(assets).to.have.property('polyfills.01.js');
                expect(assets).to.have.property('polyfills.10.js');
                expect(assets).to.have.property('polyfills.11.js');
            });

            it('correctly distributes the polyfills into these files', () => {
                const p01 = state.fs.readFileSync('/polyfills.01.js', 'utf-8');
                const p10 = state.fs.readFileSync('/polyfills.10.js', 'utf-8');
                const p11 = state.fs.readFileSync('/polyfills.11.js', 'utf-8');
                expect(p01).to.not.contain('Promise');
                expect(p01).to.contain('Array.prototype.find');
                expect(p10).to.contain('Promise');
                expect(p10).to.not.contain('Array.prototype.find');
                expect(p11).to.contain('Promise');
                expect(p11).to.contain('Array.prototype.find');
            });

            it('does not guard the polyfills', () => {
                expect(state.polyfillsFile).to.not.contain(`'Promise' in this`);
                expect(state.polyfillsFile).to.not.contain(`'find' in Array.prototype`);
            });

            it('picks the correct polyfills file to load', () => {
                expect(state.polyfillsUrl).to.equal('/polyfills.10.js');
            });

            it('loads the polyfill', () => {
                expect(state.window).to.have.property('Promise');
            });

            it('executes the entry module', () => {
                expect(state.dom.serialize()).to.contain('---SUCCESS---');
            });
        });

        describe('and the browser supports both features natively', () => {
            let state; // eslint-disable-line init-declarations
            before(async () => {
                state = await test({
                    entry: {app: 'webpack-polyfill-injector?{modules:["./test/fixtures/simple.js"]}!'},
                    plugins: [new PolyfillInjectorPlugin({polyfills: ['Promise']})],
                });
            });

            it('does not load the polyfill', () => {
                expect(state.polyfillsUrl).to.be.undefined();
            });

            it('executes the entry module', () => {
                expect(state.dom.serialize()).to.contain('---SUCCESS---');
            });
        });
    });


    describe('When requesting ten polyfills (without singleFile option)', () => {
        it('creates 1024 assets: app.js and 1023 polyfill combinations', async () => {
            const state = await test({
                entry: {app: 'webpack-polyfill-injector?{modules:["./test/fixtures/simple.js"]}!'},
                plugins: [new PolyfillInjectorPlugin({polyfills: [
                    'Promise',
                    'Array.from',
                    'Array.prototype.find',
                    'DOMTokenList',
                    'Element',
                    'Event',
                    'HTMLPictureElement',
                    'String.prototype.contains',
                    'String.prototype.endsWith',
                    'Symbol',
                ]})],
            });
            const assets = state.stats.compilation.assets;
            expect(Object.keys(assets)).to.have.lengthOf(1024);
            expect(assets).to.have.property('app.js');
            expect(assets).to.have.property('polyfills.0000000001.js');
            expect(assets).to.have.property('polyfills.1111111111.js');
        });
    });


    describe('When using [hash] as part of the filename', () => {
        let state; // eslint-disable-line init-declarations
        before(async () => {
            state = await compile({
                output: {filename: '[name].[hash].js'},
                entry: {app: 'webpack-polyfill-injector?{modules:["./test/fixtures/simple.js"]}!'},
                plugins: [new PolyfillInjectorPlugin({polyfills: ['Promise', 'Array.prototype.find']})],
            });
        });

        it('ccreates hashed polyfills files', () => {
            const polyfillFiles = state.fs.readdirSync('/').filter(name => name.startsWith('polyfills'));
            expect(polyfillFiles).to.have.lengthOf(3);
            const hash = polyfillFiles[0].replace(/^polyfills\.(.*)\.[01][01]\.js$/, '$1');
            expect(hash).to.be.a('string')
                .and.have.lengthOf.above(10)
                .and.not.include('[')
                .and.not.include(']');
            expect(polyfillFiles).to.include('polyfills.' + hash + '.01.js');
            expect(polyfillFiles).to.include('polyfills.' + hash + '.10.js');
            expect(polyfillFiles).to.include('polyfills.' + hash + '.11.js');
        });
    });


    describe('When using [chunkhash] as part of the filename', () => {
        let state; // eslint-disable-line init-declarations
        before(async () => {
            state = await compile({
                output: {filename: '[name].[chunkhash:7].js'},
                entry: {app: 'webpack-polyfill-injector?{modules:["./test/fixtures/simple.js"]}!'},
                plugins: [new PolyfillInjectorPlugin({polyfills: ['Promise', 'Array.prototype.find']})],
            });
        });

        it('ccreates hashed polyfills files', () => {
            const polyfillFiles = state.fs.readdirSync('/').filter(name => name.startsWith('polyfills'));
            expect(polyfillFiles).to.have.lengthOf(3);
            const hash = polyfillFiles[0].replace(/^polyfills\.(.*)\.[01][01]\.js$/, '$1');
            expect(hash).to.be.a('string')
                .and.have.lengthOf(7)
                .and.not.include('[')
                .and.not.include(']');
            expect(polyfillFiles).to.include('polyfills.' + hash + '.01.js');
            expect(polyfillFiles).to.include('polyfills.' + hash + '.10.js');
            expect(polyfillFiles).to.include('polyfills.' + hash + '.11.js');
        });
    });


    describe('When using an illegal configuration', () => {
        describe('Plugin without loader', () => {
            it('yields a useful error message', () =>
                expect(compile({
                    entry: './test/fixtures/simple.js',
                    plugins: [new PolyfillInjectorPlugin()],
                })).to.be.rejectedWith('The plugin must be used together with the loader!')
            );
        });
        describe('Loader without plugin', () => {
            it('yields a useful error message', () =>
                expect(compile({
                    entry: 'webpack-polyfill-injector!',
                })).to.be.rejectedWith('The loader must be used together with the plugin!')
            );
        });
        describe('No modules are specified', () => {
            it('yields a useful error message', () =>
                expect(compile({
                    entry: 'webpack-polyfill-injector!',
                    plugins: [new PolyfillInjectorPlugin()],
                })).to.be.rejectedWith('You need to specify the `modules` option!')
            );
        });
        describe('No polyfills are specified', () => {
            it('yields a useful error message', () =>
                expect(compile({
                    entry: {app: 'webpack-polyfill-injector?{modules:["./test/fixtures/simple.js"]}!'},
                    plugins: [new PolyfillInjectorPlugin()],
                })).to.be.rejectedWith('You need to specify the `polyfills` option!')
            );
        });
    });
});
