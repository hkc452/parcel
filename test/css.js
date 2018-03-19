const assert = require('assert'); 
const fs = require('fs');
const {
  bundler,
  bundle,
  run,
  assertBundleTree,
  generateTimeKey
} = require('./utils');
const promisify = require('../src/utils/promisify');
const ncp = promisify(require('ncp'));

describe('css', function() {
  it('should produce two bundles when importing a CSS file', async function() {
    let b = await bundle(__dirname + '/integration/css/index.js');

    assertBundleTree(b, {
      name: 'index.js',
      assets: ['index.js', 'index.css', 'local.js', 'local.css'],
      childBundles: [
        {
          name: 'index.map'
        },
        {
          name: 'index.css',
          assets: ['index.css', 'local.css'],
          childBundles: []
        }
      ]
    });

    let output = run(b);
    assert.equal(typeof output, 'function');
    assert.equal(output(), 3);
  });

  it('should support loading a CSS bundle along side dynamic imports', async function() {
    let b = await bundle(__dirname + '/integration/dynamic-css/index.js');

    assertBundleTree(b, {
      name: 'index.js',
      assets: [
        'index.js',
        'index.css',
        'bundle-loader.js',
        'bundle-url.js',
        'js-loader.js',
        'css-loader.js'
      ],
      childBundles: [
        {
          name: 'index.css',
          assets: ['index.css'],
          childBundles: []
        },
        {
          type: 'map'
        },
        {
          type: 'js',
          assets: ['local.js', 'local.css'],
          childBundles: [
            {
              type: 'css',
              assets: ['local.css'],
              childBundles: []
            },
            {
              type: 'map'
            }
          ]
        }
      ]
    });

    let output = run(b);
    assert.equal(typeof output, 'function');
    assert.equal(await output(), 3);
  });

  it('should support importing CSS from a CSS file', async function() {
    let b = await bundle(__dirname + '/integration/css-import/index.js');

    assertBundleTree(b, {
      name: 'index.js',
      assets: ['index.js', 'index.css', 'other.css', 'local.css'],
      childBundles: [
        {
          name: 'index.css',
          assets: ['index.css', 'other.css', 'local.css'],
          childBundles: []
        },
        {
          name: 'index.map',
          type: 'map'
        }
      ]
    });

    let output = run(b);
    assert.equal(typeof output, 'function');
    assert.equal(output(), 2);

    let css = fs.readFileSync(
      b.entryAsset.options.outDir + '/index.css',
      'utf8'
    );
    assert(css.includes('.local'));
    assert(css.includes('.other'));
    assert(/@media print {\s*.other/.test(css));
    assert(css.includes('.index'));
  });

  it('should support linking to assets with url() from CSS', async function() {
    let b = await bundle(__dirname + '/integration/css-url/index.js');

    assertBundleTree(b, {
      name: 'index.js',
      assets: ['index.js', 'index.css'],
      childBundles: [
        {
          name: 'index.css',
          assets: ['index.css'],
          childBundles: []
        },
        {
          type: 'map'
        },
        {
          type: 'woff2',
          assets: ['test.woff2'],
          childBundles: []
        }
      ]
    });

    let output = run(b);
    assert.equal(typeof output, 'function');
    assert.equal(output(), 2);

    let css = fs.readFileSync(
      b.entryAsset.options.outDir + '/index.css',
      'utf8'
    );
    assert(/url\("[0-9a-f]+\.woff2"\)/.test(css));
    assert(css.includes('url("http://google.com")'));
    assert(css.includes('.index'));
    assert(css.includes('url("data:image/gif;base64,quotes")'));
    assert(css.includes('.quotes'));
    assert(css.includes('url(data:image/gif;base64,no-quote)'));
    assert(css.includes('.no-quote'));

    assert(
      fs.existsSync(
        b.entryAsset.options.outDir +
          '/' +
          css.match(/url\("([0-9a-f]+\.woff2)"\)/)[1]
      )
    );
  });

  it('should support linking to assets with url() from CSS in production', async function() {
    let b = await bundle(__dirname + '/integration/css-url/index.js', {
      production: true
    });

    assertBundleTree(b, {
      name: 'index.js',
      assets: ['index.js', 'index.css'],
      childBundles: [
        {
          name: 'index.css',
          assets: ['index.css'],
          childBundles: []
        },
        {
          type: 'map'
        },
        {
          type: 'woff2',
          assets: ['test.woff2'],
          childBundles: []
        }
      ]
    });

    let output = run(b);
    assert.equal(typeof output, 'function');
    assert.equal(output(), 2);

    let css = fs.readFileSync(
      b.entryAsset.options.outDir + '/index.css',
      'utf8'
    );
    assert(/url\([0-9a-f]+\.woff2\)/.test(css), 'woff ext found in css');
    assert(css.includes('url(http://google.com)'), 'url() found');
    assert(css.includes('.index'), '.index found');
    assert(css.includes('url("data:image/gif;base64,quotes")'));
    assert(css.includes('.quotes'));
    assert(css.includes('url(data:image/gif;base64,no-quote)'));
    assert(css.includes('.no-quote'));

    assert(
      fs.existsSync(
        b.entryAsset.options.outDir +
          '/' +
          css.match(/url\(([0-9a-f]+\.woff2)\)/)[1]
      )
    );
  });

  it('should support transforming with postcss', async function() {
    let b = await bundle(__dirname + '/integration/postcss/index.js');

    assertBundleTree(b, {
      name: 'index.js',
      assets: ['index.js', 'index.css'],
      childBundles: [
        {
          name: 'index.css',
          assets: ['index.css'],
          childBundles: []
        },
        {
          type: 'map'
        }
      ]
    });

    let output = run(b);
    assert.equal(typeof output, 'function');

    let value = output();
    assert(/_index_[0-9a-z]+_1/.test(value));

    let cssClass = value.match(/(_index_[0-9a-z]+_1)/)[1];

    let css = fs.readFileSync(
      b.entryAsset.options.outDir + '/index.css',
      'utf8'
    );
    assert(css.includes(`.${cssClass}`));
  });

  it('should minify CSS in production mode', async function() {
    let b = await bundle(__dirname + '/integration/cssnano/index.js', {
      production: true
    });

    let output = run(b);
    assert.equal(typeof output, 'function');
    assert.equal(output(), 3);

    let css = fs.readFileSync(
      b.entryAsset.options.outDir + '/index.css',
      'utf8'
    );
    assert(css.includes('.local'));
    assert(css.includes('.index'));
    assert(!css.includes('\n'));
  });

  it('should automatically install postcss plugins with npm if needed', async function() {
    let inputDir = __dirname + `/input/${generateTimeKey()}`;
    await ncp(__dirname + '/integration/autoinstall/npm', inputDir);
    let b = bundler(inputDir + '/index.css');
    await b.bundle();

    // cssnext was installed
    let pkg = require(inputDir + '/package.json');
    assert(pkg.devDependencies['postcss-cssnext']);

    // peer dependency caniuse-lite was installed
    assert(pkg.devDependencies['caniuse-lite']);

    // cssnext is applied
    let css = fs.readFileSync(b.options.outDir + '/index.css', 'utf8');
    assert(css.includes('rgba'));
  });

  it('should automatically install postcss plugins with yarn if needed', async function() {
    let inputDir = __dirname + `/input/${generateTimeKey()}`;
    await ncp(__dirname + '/integration/autoinstall/yarn', inputDir);
    let b = bundler(inputDir + '/index.css');
    await b.bundle();

    // cssnext was installed
    let pkg = require(inputDir + '/package.json');
    assert(pkg.devDependencies['postcss-cssnext']);

    // peer dependency caniuse-lite was installed
    assert(pkg.devDependencies['caniuse-lite']);

    // appveyor is not currently writing to the yarn.lock file and will require further investigation
    // let lockfile = fs.readFileSync(inputDir + '/yarn.lock', 'utf8');
    // assert(lockfile.includes('postcss-cssnext'));

    // cssnext is applied
    let css = fs.readFileSync(b.options.outDir + '/index.css', 'utf8');
    assert(css.includes('rgba'));
  });
});
