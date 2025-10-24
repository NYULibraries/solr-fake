const axios     = require( 'axios' );
const crypto    = require( 'crypto' );
const fs        = require( 'fs' );
const http      = require( 'http' );
const moment    = require( 'moment' );
const path      = require( 'path' );
const url       = require( 'url' );

const { createLogger, format, transports } = require( 'winston' );
const { combine, timestamp, label, printf } = format;

const stringify = require( 'json-stable-stringify' );

const DEFAULT_PORT = 3000;

const INDEX_FILE = 'index.json';

let solrResponses;
let solrResponsesIndex;
let solrResponsesDirectory;
let updateSolrResponsesSolrServerUrl;

const customFormat = printf( info => {
    const timestamp = timestampEST();

    return `${ timestamp } [${ info.level }]: ${ info.message }`;
} );

const logdir = path.join( '/tmp', 'solr-fake-logs/' );

if ( ! fs.existsSync( logdir ) ) {
    fs.mkdirSync( logdir );
}

const logfile = getLogfile( logdir );

// This logger is closed over by the process.on(...) handlers, so this is in
// global scope where where the handlers are defined.
const logger = createLogger( {
                                 level : 'info',
                                 format: customFormat,
                                 transports : [
                                     new transports.File( { filename : logfile } ),
                                 ],
                             } );

function exitHandler( code ) {
    const timestamp = timestampEST();

    logger.info( `Exited with code ${ code } at ${ timestamp }` );
};

function getLogfile( logdir ) {
    return path.join(
        logdir,
        'solr-fake-' + moment( new Date() ).format( 'YYYY-MM-DDTHH-mm-ss' )
    ) + '.log';
}

function getSolrResponseFilename( queryString ) {
    const hash = crypto.createHmac( 'sha256', queryString )
        .update( queryString )
        .digest( 'hex' );

    return `${ hash }.json`;
}

function getSolrResponseFilePath( responseFile ) {
    return path.resolve( solrResponsesDirectory, responseFile )
}

async function getSolrResponseFromLiveSolr( queryString ) {
    try {
        const request = updateSolrResponsesSolrServerUrl + queryString;

        const response = await axios.get( request );

        return response.data;
    } catch( error ) {
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

function normalHandler( request, response ) {
    const requestUrl = url.parse( request.url );

    const queryString = requestUrl.search;

    if ( ! queryString ) {
        return;
    }

    const normalizedQueryString = normalizeQueryString( queryString );

    let solrResponse = solrResponses[ normalizedQueryString ];

    if ( ! solrResponse ) {
        const errorMessage = `Query string "${ queryString }" not found in index`;

        solrResponse = {
            error : errorMessage,
        };

        logger.error( errorMessage );
    }

    const solrResponseString = stringify( solrResponse, { space: '    ' } );

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
    const timestamp = moment( new Date() ).format( "ddd, D MMM YYYY H:m:s " ) + 'EST';

    logger.info( `Received ${ signal } at ${ timestamp }` );

    process.exit( code );
}

function startSolrFake( options ) {

    console.log( 'Logging to ' + logfile );

    if ( options.verbose ) {
        logger.add( new transports.Console() );
    }

    solrResponsesDirectory = options.solrResponsesDirectory;
    solrResponsesIndex = path.resolve( solrResponsesDirectory, INDEX_FILE );

    const port = options.port || DEFAULT_PORT;

    let handler;
    if ( options.updateSolrResponsesSolrServerUrl  ) {
        updateSolrResponsesSolrServerUrl = options.updateSolrResponsesSolrServerUrl;

        logger.info( 'Switching to update Solr responses mode' );
        logger.info( `Solr server = ${ updateSolrResponsesSolrServerUrl }` );

        if ( ! fs.existsSync( solrResponsesIndex ) ) {
            // Assume that user has provided a correct index path and is using the
            // update feature to create a new set of fixtures.  Create the directory
            // (whether it exists or not) and initialize the index file.
            fs.mkdirSync( solrResponsesDirectory, { recursive: true } );
            fs.writeFileSync( solrResponsesIndex, '{}', { encoding: 'utf8' } );
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
    const index = fs.existsSync( solrResponsesIndex ) ?
                      require( solrResponsesIndex )   :
                      {};

    const responseFilename = getSolrResponseFilename( queryString );
    const responseFilePath = getSolrResponseFilePath( responseFilename );

    index[ queryString ] = responseFilename;

    fs.writeFileSync( responseFilePath, solrResponse );

    fs.writeFileSync( solrResponsesIndex, stableStringify( index ) );

    logger.info( `Updated Solr response "${ queryString }" : ${ responseFilename }` );
}

async function updateSolrResponsesHandler( request, response ) {
    const requestUrl = url.parse( request.url );

    const queryString = requestUrl.search;

    if ( ! queryString ) {
        return;
    }

    const normalizedQueryString = normalizeQueryString( queryString );

    const solrResponse = await getSolrResponseFromLiveSolr( normalizedQueryString );

    const solrResponseString = stableStringify( solrResponse );

    updateSolrResponses( normalizedQueryString, solrResponseString );

    response.writeHead( 200, {
        "Access-Control-Allow-Origin" : "*",
        "Content-Type"                : "text/plain;charset=utf-8",
    } );

    response.write( solrResponseString );
    response.end();
}

function timestampEST() {
    return moment( new Date() ).format( 'ddd, D MMM YYYY H:m:s ' ) + 'EST';
}

module.exports.startSolrFake = startSolrFake;
