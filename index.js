import { createHmac } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import * as http from 'node:http';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import * as url from 'node:url';

import stringify, {} from 'json-stable-stringify';

const require = createRequire( import.meta.url );

const DEFAULT_PORT = 3000;

const INDEX_FILE = 'index.json';

let solrResponses;
let solrResponsesIndex;
let solrResponsesDirectory;
let updateSolrResponsesSolrServerUrl;
let verbose;

const logdir = path.join( '/tmp', 'solr-fake-logs/' );

if ( !existsSync( logdir ) ) {
    mkdirSync( logdir );
}

const logfile = getLogfile( logdir );

// This logger is closed over by the process.on(...) handlers, so this is in
// global scope where the handlers are defined.
const logger = {
    error: ( message ) => { log( 'error', message ); },
    info: ( message ) => { log( 'info', message ); },
};

function exitHandler( code ) {
    const timestamp = timestampEST();

    logger.info( `Exited with code ${ code } at ${ timestamp }` );
};

function getLogfile( logdir ) {
    // date.toISOString(); // 2020-05-12T23:50:21.817Z
    const timestampForFilename = new Date().toISOString()
        .replaceAll( ':', '-', )
        .replace( /\.\d{3}Z$/, '' );
    return path.join( logdir, 'solr-fake-' + timestampForFilename ) + '.log';
}

function getSolrResponseFilename( queryString ) {
    const hash = createHmac( 'sha256', queryString )
        .update( queryString )
        .digest( 'hex' );

    return `${ hash }.json`;
}

function getSolrResponseFilePath( responseFile ) {
    return path.resolve( solrResponsesDirectory, responseFile )
}

async function getSolrResponseFromLiveSolr( queryString ) {
    try {
        const requestUrl = updateSolrResponsesSolrServerUrl + queryString;

        const response = await fetch( decodeURIComponent( requestUrl ) );

        return await response.json();
    } catch ( error ) {
        logger.error( error );
    }
}

function getSolrResponses() {
    const data = {};

    const index = require( solrResponsesIndex );

    Object.keys( index ).forEach( queryString => {
        const file = getSolrResponseFilePath( index[ queryString ] );

        const response = require( file );

        data[ normalizeQueryString( queryString ) ] = response;
    } );

    return data;
}

function log( level, message ) {
    // Not bothering to validate `level` because everything is logged the same
    // for now.  This function was put in place when removing dependencies like
    // the `winston` (logging) package.  We can beef it up later if we want.
    const logLine = `${ new Date().toString() } [${ level }]: ${ message }\n`;

    if ( verbose ) {
        // We log everything to stdout, including errors.
        console.log( logLine )
    }

    // Log to file.
    writeFileSync( logfile, logLine );
}

function normalHandler( request, response ) {
    const requestUrl = url.parse( request.url );

    const queryString = requestUrl.search;

    if ( !queryString ) {
        return;
    }

    const normalizedQueryString = normalizeQueryString( queryString );

    let solrResponse = solrResponses[ normalizedQueryString ];

    if ( !solrResponse ) {
        const errorMessage = `Query string "${ queryString }" not found in index`;

        solrResponse = {
            error : errorMessage,
        };

        logger.error( errorMessage );
    }

    const solrResponseString = stringify( solrResponse, { space : '    ' } );

    response.writeHead( 200, {
        "Access-Control-Allow-Origin" : "*",
        "Content-Type"                : "text/plain;charset=utf-8",
    } );

    response.write( solrResponseString );

    logger.info( `request = "${ queryString }` );

    response.end();
}

function normalizeQueryString( queryString ) {
    const urlSearchParams = new URLSearchParams( decodeURI( queryString ) );

    urlSearchParams.sort();

    return '?' + urlSearchParams.toString();
}

function signalEventHandler( signal, code ) {
    const timestamp = timestampEST();

    logger.info( `Received ${ signal } at ${ timestamp }` );

    process.exit( code );
}

function startSolrFake( options ) {

    console.log( 'Logging to ' + logfile );

    if ( options.verbose ) {
        verbose = true;
    }

    solrResponsesDirectory = options.solrResponsesDirectory;
    solrResponsesIndex = path.resolve( solrResponsesDirectory, INDEX_FILE );

    const port = options.port || DEFAULT_PORT;

    let handler;
    if ( options.updateSolrResponsesSolrServerUrl ) {
        updateSolrResponsesSolrServerUrl = options.updateSolrResponsesSolrServerUrl;

        logger.info( 'Switching to update Solr responses mode' );
        logger.info( `Solr server = ${ updateSolrResponsesSolrServerUrl }` );

        if ( !existsSync( solrResponsesIndex ) ) {
            // Assume that user has provided a correct index path and is using the
            // update feature to create a new set of fixtures.  Create the directory
            // (whether it exists or not) and initialize the index file.
            mkdirSync( solrResponsesDirectory, { recursive : true } );
            writeFileSync( solrResponsesIndex, '{}', { encoding : 'utf8' } );
            logger.info( `Initialized new fixtures index: ${ solrResponsesIndex }` );
        }

        handler = updateSolrResponsesHandler;
    } else {
        solrResponses = getSolrResponses( solrResponsesIndex, solrResponsesDirectory );

        handler = normalHandler;
    }

    http.createServer( handler ).listen( port )
        .on( 'listening', () => {
            logger.info( 'Solr fake is running on port ' + port );
        } )
        .on( 'error', ( e ) => {
            logger.error( `HTTP server error: ${ e }` );
        } );

    process.on( 'SIGINT', signalEventHandler );
    process.on( 'SIGTERM', signalEventHandler );
    process.on( 'exit', exitHandler );
}

function stableStringify( data ) {
    return stringify( data, { space : '    ' } );
}

function updateSolrResponses( queryString, solrResponse ) {
    const index = existsSync( solrResponsesIndex ) ?
                  require( solrResponsesIndex ) :
                  {};

    const responseFilename = getSolrResponseFilename( queryString );
    const responseFilePath = getSolrResponseFilePath( responseFilename );

    index[ queryString ] = responseFilename;

    writeFileSync( responseFilePath, solrResponse );

    writeFileSync( solrResponsesIndex, stableStringify( index ) );

    logger.info( `Updated Solr response "${ queryString }" : ${ responseFilename }` );
}

async function updateSolrResponsesHandler( request, response ) {
    const requestUrl = url.parse( request.url );

    const queryString = requestUrl.search;

    if ( !queryString ) {
        return;
    }

    const normalizedQueryString = normalizeQueryString( queryString );

    const solrResponseJson = await getSolrResponseFromLiveSolr( normalizedQueryString );
    const solrResponseText = stableStringify( solrResponseJson )

    updateSolrResponses( normalizedQueryString, solrResponseText );

    response.writeHead( 200, {
        "Access-Control-Allow-Origin" : "*",
        "Content-Type"                : "text/plain;charset=utf-8",
    } );

    response.write( solrResponseText );
    response.end();
}

export {
    startSolrFake
};
