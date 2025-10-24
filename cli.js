const fs = require( 'fs' );

const argv = require( 'minimist' )( process.argv.slice( 2 ) );

const solrFake = require( './' );

let solrResponsesDirectory = argv._[ 0 ];

const port = argv.port || undefined;

const verbose = argv.verbose|| undefined;

const updateSolrResponsesSolrServerUrl = argv[ 'update-solr-responses-solr-server-url' ] || undefined;

solrFake.startSolrFake(
    {
        solrResponsesDirectory,
        port,
        updateSolrResponsesSolrServerUrl,
        verbose,
    }
);
