import { parseArgs } from 'node:util';

import { startSolrFake } from './index.js';

const options = {
    port: {
        type: 'string',
    },
    'update-solr-responses-solr-server-url': {
        type: 'string'
    },
    verbose: {
        type: 'boolean',
        default: false,
    }
}

const {
    values,
    positionals,
} = parseArgs( { options, strict: true, allowPositionals: true } );

let solrResponsesDirectory = positionals[ 0 ];

const port = values.port || undefined;

const verbose = values.verbose|| undefined;

const updateSolrResponsesSolrServerUrl = values[ 'update-solr-responses-solr-server-url' ] || undefined;

startSolrFake(
    {
        solrResponsesDirectory,
        port,
        updateSolrResponsesSolrServerUrl,
        verbose,
    }
);
