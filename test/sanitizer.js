/* global describe, it */

'use strict';

const should = require( 'chai' ).should(),
	TokenSanitizer = require( '../lib/TokenSanitizer' ),
	defines = require( '../lib/parser.defines' );

var TagTk = defines.TagTk;

describe( 'Sanitizer', function () {
	it( 'should sanitize attributes according to php\'s getAttribsRegex', function () {
		let fakeEnv = {};
		const sanitizer = new TokenSanitizer( fakeEnv );
		let name = 'testelement';
		sanitizer.attrWhiteListCache[ name ] = new Set( [
			'foo', 'עברית', '६', '搭𨋢', 'ńgh'
		] );
		let token = new TagTk( name );
		token.setAttribute( 'foo', 'bar' );
		token.setAttribute( 'bar', 'foo' );
		token.setAttribute( 'עברית', 'bar' );
		token.setAttribute( '६', 'bar' );
		token.setAttribute( '搭𨋢', 'bar' );
		token.setAttribute( 'ńgh', 'bar' );
		token = sanitizer.sanitizeToken( token );
		token.getAttribute( 'foo' ).should.equal( 'bar' );
		should.equal( token.getAttribute( 'bar' ), null );
		token.getAttribute( 'עברית' ).should.equal( 'bar' );
		token.getAttribute( '६' ).should.equal( 'bar' );
		token.getAttribute( '搭𨋢' ).should.equal( 'bar' );
		should.equal( token.getAttribute( 'ńgh' ), null );
	} );
} );
