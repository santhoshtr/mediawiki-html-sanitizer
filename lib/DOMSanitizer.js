const SAXParser = require( 'sax' ).SAXParser;
const TokenSanitzer = require( './TokenSanitizer' );
const defines = require( './Tokens' );
const Util = require( './utils/Util' );

class DOMSanitizer extends SAXParser {
	constructor( conf ) {
		super(
			false, /* strict, for HTML it is false */
			{
				lowercase: true
			}
		);
		conf = {
			wiki: {
				hasValidProtocol: function ( proto ) {
					// FIXME: At least use parsoid baseconfig protocols
					return !!proto;
				}
			}
		};
		this.buffer = '';
		this.sanitizer = new TokenSanitzer( conf );
	}

	sanitizeHTML( html ) {
		this.buffer = '';
		this.write( html ).close();
		return this.buffer;
	}

	onerror( e ) {
		throw Error( e );
	}

	ontext( text ) {
		this.buffer += text;
	}

	oncomment( comment ) {
		let token = new defines.CommentTk( comment );
		token = this.sanitizer.sanitizeToken( token );
		this.buffer += token.toHtml();
	}

	onopentag( node ) {
		let token;
		if ( Util.isVoidElement( node.name ) ) {
			token = new defines.SelfclosingTagTk( node.name );
		} else {
			token = new defines.TagTk( node.name );
		}
		token.setAttributes( node.attributes );
		token = this.sanitizer.sanitizeToken( token );
		this.buffer += token.toHtml();
	}

	onclosetag( nodename ) {
		if ( Util.isVoidElement( nodename ) ) { return; }
		let token = new defines.EndTagTk( nodename );
		token = this.sanitizer.sanitizeToken( token );
		this.buffer += token.toHtml();
	}
}

module.exports = DOMSanitizer;
