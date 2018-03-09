#!/usr/bin/env node
const fs = require( 'fs' ),
	DOMSanitizer = require( __dirname + '/../lib/DOMSanitizer' );

const xhtml = fs.readFileSync( '/dev/stdin', 'utf8' );
if ( xhtml.trim() === '' ) {
	const script = process.argv[ 1 ];
	process.stderr.write(
		'Usage: node ' + script + ' < file\n' +
		'Input must be wrapped in a block element such as <p>...</p> or <div>..</div>.\n'
	);
	process.exit( 1 );

}

const sanitizer = new DOMSanitizer();

process.stdout.write( sanitizer.sanitizeHTML( xhtml ) );
