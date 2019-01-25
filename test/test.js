/* eslint-disable max-lines */
const
    path = require('path'),
    _ = require('lodash'),
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
    optimization: {
        minimize: false,
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

function createDOM() {
    return new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', {
        runScripts: 'outside-only',
    });
}

function executeScript(dom, fs) {
    const scripts = dom.window.document.head.getElementsByTagName('script');
    if (scripts.length > 0) {
        const polyfillsUrl = scripts[0].src;
        const polyfillsFile = fs.readFileSync(polyfillsUrl, 'utf-8');
        dom.window.eval(polyfillsFile);
        dom.window.eval(`window.document.head.getElementsByTagName('script')[0].onload()`);
        return {polyfillsUrl, polyfillsFile};
    }
    return {};
}

async function test(options) {
    const testHooks = Object.assign({
        executeBundle() {
            return true;
        },
    }, options.testHooks);
    delete options.testHooks;

    const {fs, stats} = await compile(options);
    const app = fs.readFileSync('/app.js', 'utf-8');
    const dom = createDOM();
    const window = dom.window;
    const state = {fs, stats, dom, window, app};

    if (testHooks.executeBundle(state) === false) {
        return state;
    }

    window.eval(app);
    return Object.assign(state, executeScript(dom, fs));
}

describe('webpack-polyfill-injector', () => {
    describe('When requesting a single polyfill', () => {
        describe('and the browser does not implement that feature natively', () => {
            let state; // eslint-disable-line init-declarations
            before(async () => {
                state = await test({
                    entry: {app: 'webpack-polyfill-injector?{modules:["./test/fixtures/entry.js"]}!'},
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
                    entry: {app: 'webpack-polyfill-injector?{modules:["./test/fixtures/entry.js"]}!'},
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
                    entry: {app: 'webpack-polyfill-injector?{modules:["./test/fixtures/entry.js"]}!'},
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
                    entry: {app: 'webpack-polyfill-injector?{modules:["./test/fixtures/entry.js"]}!'},
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
                    entry: {app: 'webpack-polyfill-injector?{modules:["./test/fixtures/entry.js"]}!'},
                    plugins: [new PolyfillInjectorPlugin({polyfills: ['Array.prototype.find', 'Promise']})],
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
                expect(p01).to.not.contain('Array.prototype.find');
                expect(p01).to.contain('Promise');
                expect(p10).to.contain('Array.prototype.find');
                expect(p10).to.not.contain('Promise');
                expect(p11).to.contain('Array.prototype.find');
                expect(p11).to.contain('Promise');
            });

            it('picks the correct polyfills file to load', () => {
                expect(state.polyfillsUrl).to.equal('/polyfills.01.js');
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
                    entry: {app: 'webpack-polyfill-injector?{modules:["./test/fixtures/entry.js"]}!'},
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


    describe('When requesting Promise and Promise.prototype.finally', () => {
        let state; // eslint-disable-line init-declarations
        before(async () => {
            state = await test({
                entry: {app: 'webpack-polyfill-injector?{modules:["./test/fixtures/entry.js"]}!'},
                plugins: [new PolyfillInjectorPlugin({polyfills: ['Promise', 'Promise.prototype.finally']})],
            });
        });

        it('strips Promise.prototype.finally when Promise gets polyfilled', () => {
            const polyfills = state.fs.readFileSync('/polyfills.11.js', 'utf-8');
            expect(polyfills).to.contain(`('Promise' in this)`);
            expect(polyfills).to.not.contain(`('Promise' in this && 'finally' in Promise.prototype)`);
        });

        it('strips Promise when it is supported natively and Promise.prototype.finally gets polyfilled', () => {
            const polyfills = state.fs.readFileSync('/polyfills.01.js', 'utf-8');
            expect(polyfills).to.not.contain(`('Promise' in this)`);
            expect(polyfills).to.contain(`('Promise' in this && 'finally' in Promise.prototype)`);
        });
    });


    describe('When requesting ten polyfills (without singleFile option)', () => {
        it('creates 1024 assets: app.js and 1023 polyfill combinations', async () => {
            const state = await test({
                entry: {app: 'webpack-polyfill-injector?{modules:["./test/fixtures/entry.js"]}!'},
                plugins: [new PolyfillInjectorPlugin({polyfills: [
                    'Promise',
                    'Array.from',
                    'Array.prototype.find',
                    'DOMTokenList',
                    'Element',
                    'Event',
                    'HTMLPictureElement',
                    'String.prototype.includes',
                    'String.prototype.endsWith',
                    'Symbol',
                ]})],
            });
            const assets = state.stats.compilation.assets;
            expect(Object.keys(assets)).to.have.lengthOf(1024);
            expect(assets).to.have.property('app.js');
            expect(assets).to.have.property('polyfills.0000000001.js');
            expect(assets).to.have.property('polyfills.1111111111.js');
        }).timeout(60000);
    });


    describe('When configuring multiple entry modules', () => {
        describe('with different polyfills', () => {
            let state; // eslint-disable-line init-declarations
            before(async () => {
                state = await test({
                    entry: {
                        app: `webpack-polyfill-injector?${JSON.stringify({
                            modules: [
                                './test/fixtures/entry.js',
                                './test/fixtures/entry2.js',
                            ],
                            polyfills: ['Promise'],
                        })}!`,
                        other: `webpack-polyfill-injector?${JSON.stringify({
                            modules: [
                                './test/fixtures/entry3.js',
                            ],
                            polyfills: ['Array.prototype.find'],
                        })}!`,
                    },
                    plugins: [new PolyfillInjectorPlugin({polyfills: ['Promise', 'Array.prototype.find']})],
                    testHooks: {
                        executeBundle({window}) {
                            window.eval('delete window.Promise');
                            window.eval('delete window.Array.prototype.find');
                        },
                    },
                });
            });

            it('creates four assets: app.js, other.js, polyfills.js, polyfills-1.js', () => {
                const assets = state.stats.compilation.assets;
                expect(Object.keys(assets)).to.have.lengthOf(4);
                expect(assets).to.have.property('app.js');
                expect(assets).to.have.property('polyfills.js');
                expect(assets).to.have.property('other.js');
                expect(assets).to.have.property('polyfills-1.js');
            });

            it('does not mix the polyfill configurations', () => {
                const polyfills2 = state.fs.readFileSync('/polyfills-1.js', 'utf-8');
                expect(state.polyfillsFile).to.contain('Promise');
                expect(state.polyfillsFile).to.not.contain('Array.prototype.find');
                expect(polyfills2).to.not.contain('Promise');
                expect(polyfills2).to.contain('Array.prototype.find');
            });

            it('executes the "app" entry module correctly', () => {
                expect(state.window).to.have.property('Promise');
                expect(state.window.Array.prototype).to.not.have.property('find');
                expect(state.dom.serialize())
                    .to.contain('<p>---SUCCESS---</p><p>[entry2]function[/entry2]</p>')
                    .and.to.not.contain('entry3');
            });

            it('executes the "other" entry module correctly', () => {
                const dom = createDOM();
                dom.window.eval('delete window.Promise');
                dom.window.eval('delete window.Array.prototype.find');
                dom.window.eval(state.fs.readFileSync('/other.js', 'utf-8'));
                executeScript(dom, state.fs);
                expect(dom.window).to.not.have.property('Promise');
                expect(dom.window.Array.prototype).to.have.property('find');
                expect(dom.serialize())
                    .to.contain('<p>[entry3]function[/entry3]</p>')
                    .and.to.not.contain('---SUCCESS---')
                    .and.to.not.contain('entry2');
            });
        });

        describe('with the same polyfills', () => {
            it('creates five assets: app.js, other.js, polyfills.01.js, polyfills.10.js, polyfills.11.js', async () => {
                const state = await test({
                    entry: {
                        app: `webpack-polyfill-injector?${JSON.stringify({
                            modules: [
                                './test/fixtures/entry.js',
                                './test/fixtures/entry2.js',
                            ],
                            polyfills: ['Promise', 'Array.prototype.find'],
                        })}!`,
                        other: `webpack-polyfill-injector?${JSON.stringify({
                            modules: [
                                './test/fixtures/entry3.js',
                            ],
                            polyfills: ['Promise', 'Array.prototype.find'],
                        })}!`,
                    },
                    plugins: [new PolyfillInjectorPlugin()],
                });
                const assets = state.stats.compilation.assets;
                expect(Object.keys(assets)).to.have.lengthOf(5);
                expect(assets).to.have.property('app.js');
                expect(assets).to.have.property('polyfills.01.js');
                expect(assets).to.have.property('polyfills.10.js');
                expect(assets).to.have.property('polyfills.11.js');
                expect(assets).to.have.property('other.js');
            });
        });
    });


    describe('When using [hash] as part of the filename', () => {
        it('creates hashed polyfills files', async () => {
            const state = await compile({
                output: {filename: '[name].[hash].js'},
                entry: {app: 'webpack-polyfill-injector?{modules:["./test/fixtures/entry.js"]}!'},
                plugins: [new PolyfillInjectorPlugin({polyfills: ['Promise', 'Array.prototype.find']})],
            });

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
        it('creates hashed polyfills files', async () => {
            const state = await compile({
                output: {filename: '[name].[chunkhash:7].js'},
                entry: {app: 'webpack-polyfill-injector?{modules:["./test/fixtures/entry.js"]}!'},
                plugins: [new PolyfillInjectorPlugin({polyfills: ['Promise', 'Array.prototype.find']})],
            });

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


    describe('When configuring strings instead of arrays', () => {
        it('interprets them as arrays', () => {
            expect(compile({
                entry: {app: 'webpack-polyfill-injector?{modules:"./test/fixtures/entry.js"}!'},
                plugins: [new PolyfillInjectorPlugin({polyfills: 'Promise'})],
            })).to.be.fulfilled();
        });
    });


    describe('When using an illegal configuration', () => {
        describe('Plugin without loader', () => {
            it('yields a useful error message', () =>
                expect(compile({
                    entry: './test/fixtures/entry.js',
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
                    entry: {app: 'webpack-polyfill-injector?{modules:["./test/fixtures/entry.js"]}!'},
                    plugins: [new PolyfillInjectorPlugin()],
                })).to.be.rejectedWith('You need to specify the `polyfills` option!')
            );
        });
        describe('Invalid polyfill is specified', () => {
            it('yields a useful error message', () =>
                expect(compile({
                    entry: {app: 'webpack-polyfill-injector?{modules:["./test/fixtures/entry.js"]}!'},
                    plugins: [new PolyfillInjectorPlugin({polyfills: ['InvalidFoobar']})],
                })).to.be.rejectedWith('The polyfill InvalidFoobar does not exist!')
            );
        });
    });

    describe('When using without publicPath', () => {
        it('defaults to empty string', (done) => {
            const config = _.merge({}, webpackConfig, {
                output: {filename: '[name].js'},
                entry: {app: 'webpack-polyfill-injector?{modules:["./test/fixtures/entry.js"]}!'},
                plugins: [new PolyfillInjectorPlugin({polyfills: ['Promise', 'Array.prototype.find']})],
            });
            delete config.output.publicPath;
            const compiler = webpack(config);
            const fs = new MemoryFS();
            compiler.outputFileSystem = fs;
            compiler.run((err, stats) => {
                if (err) {
                    done(err);
                } else if (stats.compilation.errors.length > 0) {
                    done(stats.compilation.errors[0]);
                } else {
                    expect(fs.readFileSync('/app.js', 'utf-8')).to.be.a('string')
                        .and.include(`js.src = "polyfills." + polyfills.join('') + '.js';`);
                    done();
                }
            });
        });
    });
});
