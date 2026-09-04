# Solr Fake

A quick-and-dirty Solr fake providing reliable, reproducible Solr 
interactions with a real HTTP server. Used primarily for AppDev search 
application automated tests.

# Quickstart

Install:

```shell
git clone git@github.com:NYULibraries/solr-fake.git
cd solr-fake
npm install
```

There are two ways to use the Solr Fake: in CLI mode, or as an imported module.

## CLI

**Start up Solr Fake on port 8983 in update mode**

```shell
node cli.js \
    --port 8983 \
    --verbose \
    --update-solr-responses-solr-server-url $SOLR_SELECT_ENDPOINT_URL \
    $FIXTURES_DIRECTORY
```

* `SOLR_SELECT_ENDPOINT_URL`: The URL of the Solr _/select_ endpoint to use for
creating/updating the Solr response fixtures.
* `FIXTURES_DIRECTORY`: Directory containing the saved Solr response fixtures
  and the index file mapping requests to the fixture files.

All requests to the Solr Fake running on 8983 are proxied to 
`$SOLR_SELECT_ENDPOINT_URL` and responses are saved into`$FIXTURES_DIRECTORY`.
If the request is a duplicate of an already saved request, the new request's
response will overwrite the old one.

Note that *deletion* of requests must be done
manually by deleting the fixture files and their entries in the index file.

**Start up Solr Fake on port 8983 and serve existing fixtures as fake Solr
responses**

```shell
node cli.js --port 8983 --verbose $FIXTURES_DIRECTORY 
```

## Imported module

Import:

```js
import { startSolrFake, stopSolrFake } from 'solr-fake';
```

**Start up Solr Fake inside a Playwright test file**

Please see the preceding CLI section for details on the options and what the
Solr Fake does after startup.

```shell
test.beforeAll( async () => {
    const solrResponsesDirectory = path.resolve(
        import.meta.dirname,
        '..',
        'fixtures',
        'solr-fake',
    );
    const options = {
        port   : 8983,
        solrResponsesDirectory,
        verbose: false,
    };

    if ( updateSolrFakeResponses() ) {
        options.updateSolrResponsesSolrServerUrl =
            `http://${ SOLR_HOSTNAME }/solr/findingaids/select`;
    }

    startSolrFake( options );
} );

...

test.afterAll( () => {
    stopSolrFake();
} );
```

If Solr Fake is being used in multiple test files with the same
`solrResponsesDirectory`, it would probably be a little safer to run the test
files one at a time when in update mode instead of in parallel.

# Development history

The original codebase was [dlts-solr-fake](https://github.com/NYULibraries/dlts-solr-fake),
which as of this writing (9/2026) still exists and is in use.  The author later 
moved from DLTS to AppDev, and created this new repo by copying 
`dlts-solr-fake` on September 1, 2026.

This repo was created as a copy instead of a fork to make it a completely 
independent codebase which will evolve (if it evolves at all) based on AppDev
testing needs.

# TODO

There are lots of TODOs. The original [dlts-solr-fake](https://github.com/NYULibraries/dlts-solr-fake)
was a quick-and-dirty project to help with automated testing of Solr-based
search applications. This new project was itself a quick-and-dirty update of 
the 7-year-old codebase.

