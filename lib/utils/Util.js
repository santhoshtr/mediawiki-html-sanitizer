/*
 * This file contains general utilities for token transforms.
 */

'use strict';

const entities = require( 'entities' );

const Consts = require( '../config/WikitextConstants' );

// This is a circular dependency.  Don't use anything from defines at module
// evaluation time.  (For example, we can't define the usual local variable
// shortcuts here.)
const tokens = require( '../Tokens.js' );

/**
 * @class
 * @singleton
 */
class Util {
	constructor() {
		// Non-global and global versions of regexp for use everywhere
		this.COMMENT_REGEXP = /<!--(?:[^-]|-(?!->))*-->/;
		this.COMMENT_REGEXP_G = /<!--(?:[^-]|-(?!->))*-->/g;
		// Regep for checking marker metas typeofs representing
		// transclusion markup or template param markup.
		this.TPL_META_TYPE_REGEXP = /(?:^|\s)(mw:(?:Transclusion|Param)(?:\/End)?)(?=$|\s)/;
		this.solTransparentLinkRegexp = /(?:^|\s)mw:PageProp\/(?:Category|redirect|Language)(?=$|\s)/;
	}

	/**
	 *
	 * Split a tracing / debugging flag string into individual flags
	 * and return them.
	 *
	 * @param {Object} origFlag The original flag string
	 * @return {Array}
	 */
	static splitFlags( origFlag ) {
		let objFlags = origFlag.split( ',' );
		if ( objFlags.indexOf( 'selser' ) !== -1 && objFlags.indexOf( 'wts' ) === -1 ) {
			objFlags.push( 'wts' );
		}
		return objFlags;
	}

	/**
	 * Update only those properties that are undefined or null in the target.
	 *
	 * @param {Object} tgt The object to modify.
	 * @param {...Object} subject The object to extend tgt with. Add more arguments to the function call to chain more extensions.
	 * @return {Object} The modified object.
	 */
	static extendProps( tgt ) {
		function internalExtend( target, obj ) {
			let allKeys = [].concat( Object.keys( target ), Object.keys( obj ) );
			for ( let i = 0, numKeys = allKeys.length; i < numKeys; i++ ) {
				let k = allKeys[ i ];
				if ( target[ k ] === undefined || target[ k ] === null ) {
					target[ k ] = obj[ k ];
				}
			}
			return target;
		}
		let n = arguments.length;
		for ( let j = 1; j < n; j++ ) {
			internalExtend( tgt, arguments[ j ] );
		}
		return tgt;
	}

	static stripParsoidIdPrefix( aboutId ) {
		// 'mwt' is the prefix used for new ids in mediawiki.parser.environment#newObjectId
		return aboutId.replace( /^#?mwt/, '' );
	}

	static isParsoidObjectId( aboutId ) {
		// 'mwt' is the prefix used for new ids in mediawiki.parser.environment#newObjectId
		return aboutId.match( /^#mwt/ );
	}

	/**
	 * Determine if a tag is block-level or not
	 *
	 * `<video>` is removed from block tags, since it can be phrasing content.
	 * This is necessary for it to render inline.
	 */
	static isBlockTag( name ) {
		name = name.toUpperCase();
		return name !== 'VIDEO' && Consts.HTML.HTML4BlockTags.has( name );
	}

	/**
	 * In the PHP parser, these block tags open block-tag scope
	 * See doBlockLevels in the PHP parser (includes/parser/Parser.php)
	 */
	static tagOpensBlockScope( name ) {
		return Consts.BlockScopeOpenTags.has( name.toUpperCase() );
	}

	/**
	 * In the PHP parser, these block tags close block-tag scope
	 * See doBlockLevels in the PHP parser (includes/parser/Parser.php)
	 */
	static tagClosesBlockScope( name ) {
		return Consts.BlockScopeCloseTags.has( name.toUpperCase() );
	}

	/**
	 * Determine if the named tag is void (can not have content).
	 */
	static isVoidElement( name ) {
		return Consts.HTML.VoidTags.has( name.toUpperCase() );
	}

	/**
	* Determine if a token is block-level or not
	*/
	static isBlockToken( token ) {
		if ( token.constructor.name === 'TagTk' ||
				token.constructor.name === 'EndTagTk' ||
				token.constructor.name === 'SelfclosingTagTk' ) {
			return Util.isBlockTag( token.name );
		} else {
			return false;
		}
	}

	static isTemplateToken( token ) {
		return token && token.constructor.name === 'SelfclosingTagTk' && token.name === 'template';
	}

	static isTemplateMeta( t ) {
		return t.name === 'meta' && Util.TPL_META_TYPE_REGEXP.test( t.getAttribute( 'typeof' ) );
	}

	static isTableTag( token ) {
		let tc = token.constructor.name;
		return ( tc === 'TagTk' || tc === 'EndTagTk' ) &&
			Consts.HTML.TableTags.has( token.name.toUpperCase() );
	}

	static hasParsoidTypeOf( typeOf ) {
		return ( /(^|\s)mw:[^\s]+/ ).test( typeOf );
	}

	static isSolTransparentLinkTag( token ) {
		let tc = token.constructor.name;
		return ( tc === 'SelfclosingTagTk' || tc === 'TagTk' || tc === 'EndTagTk' ) &&
			token.name === 'link' &&
			this.solTransparentLinkRegexp.test( token.getAttribute( 'rel' ) );
	}

	static isBehaviorSwitch( env, token ) {
		return token.constructor.name === 'SelfclosingTagTk' && (
			// Before BehaviorSwitchHandler (ie. PreHandler, etc.)
			token.name === 'behavior-switch' ||
			// After BehaviorSwitchHandler
			// (ie. ListHandler, ParagraphWrapper, etc.)
			( token.name === 'meta' &&
				env.conf.wiki.bswPagePropRegexp.test( token.getAttribute( 'property' ) ) )
		);
	}

	// This should come close to matching DU.emitsSolTransparentSingleLineWT(),
	// without the single line caveat.
	static isSolTransparent( env, token ) {
		let tc = token.constructor.name;
		if ( tc === String ) {
			return token.match( /^\s*$/ );
		} else if ( this.isSolTransparentLinkTag( token ) ) {
			return true;
		} else if ( tc === tokens.CommentTk ) {
			return true;
		} else if ( this.isBehaviorSwitch( env, token ) ) {
			return true;
		} else if ( tc !== 'SelfclosingTagTk' || token.name !== 'meta' ) {
			return false;
		} else { // only metas left
			// Treat all mw:Extension/* tokens as non-SOL.
			if ( /(?:^|\s)mw:Extension\//.test( token.getAttribute( 'typeof' ) ) ) {
				return false;
			} else {
				return token.dataAttribs.stx !== 'html';
			}
		}
	}

	static isEmptyLineMetaToken( token ) {
		return token.constructor.name === 'SelfclosingTagTk' &&
			token.name === 'meta' &&
			token.getAttribute( 'typeof' ) === 'mw:EmptyLine';
	}

	/*
	 * Transform "\n" and "\r\n" in the input string to NlTk tokens
	 */
	static newlinesToNlTks( str, tsr0 ) {
		let toks = str.split( /\n|\r\n/ );
		let ret = [];
		let tsr = tsr0;
		let i = 0;
		// Add one NlTk between each pair, hence toks.length-1
		for ( let n = toks.length - 1; i < n; i++ ) {
			ret.push( toks[ i ] );
			let nlTk = new tokens.NlTk();
			if ( tsr !== undefined ) {
				tsr += toks[ i ].length;
				nlTk.dataAttribs = { tsr: [ tsr, tsr + 1 ] };
			}
			ret.push( nlTk );
		}
		ret.push( toks[ i ] );
		return ret;
	}

	static toStringTokens( tokens, indent ) {
		if ( !indent ) {
			indent = '';
		}

		if ( !Array.isArray( tokens ) ) {
			return [ tokens.toString( false, indent ) ];
		} else if ( tokens.length === 0 ) {
			return [ null ];
		} else {
			let buf = [];
			for ( let i = 0, n = tokens.length; i < n; i++ ) {
				buf.push( tokens[ i ].toString( false, indent ) );
			}
			return buf;
		}
	}

	static isEntitySpanToken( token ) {
		return token.constructor.name === 'TagTk' && token.name === 'span' &&
			token.getAttribute( 'typeof' ) === 'mw:Entity';
	}

	/**
	 * Strip include tags, and the contents of includeonly tags as well.
	 */
	static stripIncludeTokens( tokens ) {
		let toks = [];
		let includeOnly = false;
		for ( let i = 0; i < tokens.length; i++ ) {
			let tok = tokens[ i ];
			switch ( tok.constructor.name ) {
				case 'TagTk':
				case 'EndTagTk':
				case 'SelfclosingTagTk':
					if ( [ 'noinclude', 'onlyinclude' ].includes( tok.name ) ) {
						continue;
					} else if ( tok.name === 'includeonly' ) {
						includeOnly = ( tok.constructor.name === 'TagTk' );
						continue;
					}
				// Fall through
				default:
					if ( !includeOnly ) {
						toks.push( tok );
					}
			}
		}
		return toks;
	}

	static tokensToString( tokens, strict, opts ) {
		let out = '';
		if ( !opts ) {
			opts = {};
		}
		// XXX: quick hack, track down non-array sources later!
		if ( !Array.isArray( tokens ) ) {
			tokens = [ tokens ];
		}
		for ( let i = 0, l = tokens.length; i < l; i++ ) {
			let token = tokens[ i ];
			if ( !token ) {
				continue;
			} else if ( token.constructor.name === String ) {
				out += token;
			} else if ( token.constructor.name === 'CommentTk' ||
					( !opts.retainNLs && token.constructor.name === 'NlTk' ) ) {
				// strip comments and newlines
			} else if ( opts.stripEmptyLineMeta && this.isEmptyLineMetaToken( token ) ) {
				// If requested, strip empty line meta tokens too.
			} else if ( opts.includeEntities && this.isEntitySpanToken( token ) ) {
				out += token.dataAttribs.src;
				i += 2; // Skip child and end tag.
			} else if ( strict ) {
				// If strict, return accumulated string on encountering first non-text token
				return [ out, tokens.slice( i ) ];
			} else if ( Array.isArray( token ) ) {
				out += this.tokensToString( token, strict, opts );
			}
		}
		return out;
	}

	static flattenAndAppendToks( array, prefix, t ) {
		if ( Array.isArray( t ) || t.constructor === String ) {
			if ( t.length > 0 ) {
				if ( prefix ) {
					array.push( prefix );
				}
				array = array.concat( t );
			}
		} else {
			if ( prefix ) {
				array.push( prefix );
			}
			array.push( t );
		}

		return array;
	}

	// deep clones by default.
	static clone( obj, deepClone ) {
		if ( deepClone === undefined ) {
			deepClone = true;
		}
		if ( Array.isArray( obj ) ) {
			if ( deepClone ) {
				return obj.map( function ( el ) {
					return Util.clone( el, true );
				} );
			} else {
				return obj.slice();
			}
		} else if ( obj instanceof Object && // only "plain objects"
					Object.getPrototypeOf( obj ) === Object.prototype ) {
			/* This definition of "plain object" comes from jquery,
			 * via zepto.js.  But this is really a big hack; we should
			 * probably put a console.assert() here and more precisely
			 * delimit what we think is legit to clone. (Hint: not
			 * tokens or DOM trees.) */
			if ( deepClone ) {
				return Object.keys( obj ).reduce( function ( nobj, key ) {
					nobj[ key ] = Util.clone( obj[ key ], true );
					return nobj;
				}, {} );
			} else {
				return Object.assign( {}, obj );
			}
		} else {
			return obj;
		}
	}

	// Just a copy `Util.clone` used in *testing* to reverse the effects of
	// freezing an object.  Works with more that just "plain objects"
	static unFreeze( obj, deepClone ) {
		if ( deepClone === undefined ) {
			deepClone = true;
		}
		if ( Array.isArray( obj ) ) {
			if ( deepClone ) {
				return obj.map( function ( el ) {
					return Util.unFreeze( el, true );
				} );
			} else {
				return obj.slice();
			}
		} else if ( obj instanceof Object ) {
			if ( deepClone ) {
				return Object.keys( obj ).reduce( function ( nobj, key ) {
					nobj[ key ] = Util.unFreeze( obj[ key ], true );
					return nobj;
				}, new obj.constructor() );
			} else {
				return Object.assign( {}, obj );
			}
		} else {
			return obj;
		}
	}

	// 'cb' can only be called once after "everything" is done.
	// But, we need something that can be used in async context where it is
	// called repeatedly till we are done.
	//
	// Primarily needed in the context of async.map calls that requires a 1-shot callback.
	//
	// Use with caution!  If the async stream that we are accumulating into the buffer
	// is a firehose of tokens, the buffer will become huge.
	static buildAsyncOutputBufferCB( cb ) {
		function AsyncOutputBufferCB( cb2 ) {
			this.accum = [];
			this.targetCB = cb2;
		}

		AsyncOutputBufferCB.prototype.processAsyncOutput = function ( res ) {
			// * Ignore switch-to-async mode calls since
			//   we are actually collapsing async calls.
			// * Accumulate async call results in an array
			//   till we get the signal that we are all done
			// * Once we are done, pass everything to the target cb.
			if ( res.async !== true ) {
				// There are 3 kinds of callbacks:
				// 1. cb({tokens: .. })
				// 2. cb({}) ==> toks can be undefined
				// 3. cb(foo) -- which means in some cases foo can
				//    be one of the two cases above, or it can also be a simple string.
				//
				// Version 1. is the general case.
				// Versions 2. and 3. are optimized scenarios to eliminate
				// additional processing of tokens.
				//
				// In the C++ version, this is handled more cleanly.
				let toks = res.tokens;
				if ( !toks && res.constructor === String ) {
					toks = res;
				}

				if ( toks ) {
					if ( Array.isArray( toks ) ) {
						for ( let i = 0, l = toks.length; i < l; i++ ) {
							this.accum.push( toks[ i ] );
						}
						// this.accum = this.accum.concat(toks);
					} else {
						this.accum.push( toks );
					}
				}

				if ( !res.async ) {
					// we are done!
					this.targetCB( this.accum );
				}
			}
		};

		let r = new AsyncOutputBufferCB( cb );
		return r.processAsyncOutput.bind( r );
	}

	static lookupKV( kvs, key ) {
		if ( !kvs ) {
			return null;
		}
		let kv;
		for ( let i = 0, l = kvs.length; i < l; i++ ) {
			kv = kvs[ i ];
			if ( kv.k.constructor === String && kv.k.trim() === key ) {
				// found, return it.
				return kv;
			}
		}
		// nothing found!
		return null;
	}

	static lookup( kvs, key ) {
		let kv = this.lookupKV( kvs, key );
		return kv === null ? null : kv.v;
	}

	static lookupValue( kvs, key ) {
		if ( !kvs ) {
			return null;
		}
		let kv;
		for ( let i = 0, l = kvs.length; i < l; i++ ) {
			kv = kvs[ i ];
			if ( kv.v === key ) {
				// found, return it.
				return kv;
			}
		}
		// nothing found!
		return null;
	}

	/**
	 * Convert an array of key-value pairs into a hash of keys to values. For
	 * duplicate keys, the last entry wins.
	 */
	static kvToHash( kvs, convertValuesToString, useSrc ) {
		if ( !kvs ) {
			console.warn( 'Invalid kvs!: ' + JSON.stringify( kvs, null, 2 ) );
			return Object.create( null );
		}
		let res = Object.create( null );
		for ( let i = 0, l = kvs.length; i < l; i++ ) {
			let kv = kvs[ i ];
			let key = this.tokensToString( kv.k ).trim();
			// SSS FIXME: Temporary fix to handle extensions which use
			// entities in attribute values. We need more robust handling
			// of non-string template attribute values in general.
			let val = ( useSrc && kv.vsrc !== undefined ) ? kv.vsrc :
				convertValuesToString ? this.tokensToString( kv.v ) : kv.v;
			res[ key.toLowerCase() ] = this.tokenTrim( val );
		}
		return res;
	}

	/**
	 * Trim space and newlines from leading and trailing text tokens.
	 */
	static tokenTrim( tokens ) {
		if ( !Array.isArray( tokens ) ) {
			return tokens;
		}

		// Since the tokens array might be frozen,
		// we have to create a new array -- but, create it
		// only if needed
		//
		// FIXME: If tokens is not frozen, we can avoid
		// all this circus with leadingToks and trailingToks
		// but we will need a new function altogether -- so,
		// something worth considering if this is a perf. problem.

		let i, token;
		let n = tokens.length;

		// strip leading space
		let leadingToks = [];
		for ( i = 0; i < n; i++ ) {
			token = tokens[ i ];
			if ( token.constructor.name === tokens.NlTk ) {
				leadingToks.push( '' );
			} else if ( token.constructor.name === String ) {
				leadingToks.push( token.replace( /^\s+/, '' ) );
				if ( token !== '' ) {
					break;
				}
			} else {
				break;
			}
		}

		i = leadingToks.length;
		if ( i > 0 ) {
			tokens = leadingToks.concat( tokens.slice( i ) );
		}

		// strip trailing space
		let trailingToks = [];
		for ( i = n - 1; i >= 0; i-- ) {
			token = tokens[ i ];
			if ( token.constructor.name === 'NlTk' ) {
				trailingToks.push( '' ); // replace newline with empty
			} else if ( token.constructor.name === String ) {
				trailingToks.push( token.replace( /\s+$/, '' ) );
				if ( token !== '' ) {
					break;
				}
			} else {
				break;
			}
		}

		let j = trailingToks.length;
		if ( j > 0 ) {
			tokens = tokens.slice( 0, n - j ).concat( trailingToks.reverse() );
		}

		return tokens;
	}

	// Strip EOFTk token from token chunk
	static stripEOFTkfromTokens( tokens ) {
		// this.dp( 'stripping end or whitespace tokens' );
		if ( !Array.isArray( tokens ) ) {
			tokens = [ tokens ];
		}
		if ( !tokens.length ) {
			return tokens;
		}
		// Strip 'end' token
		if ( tokens.length && lastItem( tokens ).constructor.name === 'EOFTk' ) {
			let rank = tokens.rank;
			tokens = tokens.slice( 0, -1 );
			tokens.rank = rank;
		}

		return tokens;
	}

	// Strip NlTk and ws-only trailing text tokens. Used to be part of
	// stripEOFTkfromTokens, but unclear if this is still needed.
	// TODO: remove this if this is not needed any more!
	static stripTrailingNewlinesFromTokens( tokens ) {
		let token = lastItem( tokens );
		let lastMatches = function ( toks ) {
			let lastTok = lastItem( toks );
			return lastTok && (
				lastTok.constructor.name === 'NlTk' ||
					lastTok.constructor === String && /^\s+$/.test( token ) );
		};
		if ( lastMatches ) {
			tokens = tokens.slice();
		}
		while ( lastMatches ) {
			tokens.pop();
		}
		return tokens;
	}

	/**
	 * Creates a dom-fragment-token for processing 'content' (an array of tokens)
	 * in its own subpipeline all the way to DOM. These tokens will be processed
	 * by their own handler (DOMFragmentBuilder) in the last stage of the async
	 * pipeline.
	 *
	 * srcOffsets should always be provided to process top-level page content in a
	 * subpipeline. Without it, DSR computation and template wrapping cannot be done
	 * in the subpipeline. While unpackDOMFragment can do this on unwrapping, that can
	 * be a bit fragile and makes dom-fragments a leaky abstraction by leaking subpipeline
	 * processing into the top-level pipeline.
	 *
	 * @param {Token[]} content
	 *   The array of tokens to process
	 * @param {Number[]} srcOffsets
	 *   Wikitext source offsets (start/end) of these tokens
	 * @param {Object} [opts]
	 *   Parsing options
	 * @param {Token} opts.contextTok
	 *   The token that generated the content
	 * @param {Boolean} opts.noPre
	 *   Suppress indent-pres in content
	 */
	static getDOMFragmentToken( content, srcOffsets, opts ) {
		if ( !opts ) {
			opts = {};
		}

		return new tokens.SelfclosingTagTk( 'mw:dom-fragment-token', [
			new tokens.KV( 'contextTok', opts.token ),
			new tokens.KV( 'content', content ),
			new tokens.KV( 'noPre', opts.noPre || false ),
			new tokens.KV( 'noPWrapping', opts.noPWrapping || false ),
			new tokens.KV( 'srcOffsets', srcOffsets )
		] );
	}

	// Does this need separate UI/content inputs?
	static formatNum( num ) {
		return String( num );
	}

	// Emulate PHP's urlencode by patching results of
	// JS's encodeURIComponent
	//
	// PHP: https://secure.php.net/manual/en/function.urlencode.php
	// JS:  https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/encodeURIComponent
	//
	// Spaces to '+' is a PHP peculiarity as well.
	static phpURLEncode( txt ) {
		return encodeURIComponent( txt )
			.replace( /!/g, '%21' )
			.replace( /'/g, '%27' )
			.replace( /\(/g, '%28' )
			.replace( /\)/g, '%29' )
			.replace( /\*/g, '%2A' )
			.replace( /~/g, '%7E' )
			.replace( /%20/g, '+' );
	}

	static decodeURI( s ) {
		return s.replace( /(%[0-9a-fA-F][0-9a-fA-F])+/g, function ( m ) {
			try {
				// JS library function
				return decodeURIComponent( m );
			} catch ( e ) {
				return m;
			}
		} );
	}

	/**
	 * Strip a string suffix if it matches
	 */
	static stripSuffix( text, suffix ) {
		let sLen = suffix.length;
		if ( sLen && text.substr( -sLen ) === suffix ) {
			return text.substr( 0, text.length - sLen );
		} else {
			return text;
		}
	}

	/**
	 * Processes content (wikitext, array of tokens, whatever) in its own pipeline
	 * based on options.
	 *
	 * @param {Object} env
	 *    The environment/context for the expansion.
	 *
	 * @param {Object} frame
	 *    The parent frame within which the expansion is taking place.
	 *    This param is mostly defunct now that we are not doing native
	 *    expansion anymore.
	 *
	 * @param {Object} content
	 *    This could be wikitext or single token or an array of tokens.
	 *    How this content is processed depends on what kind of pipeline
	 *    is constructed specified by opts.
	 *
	 * @param {Object} opts
	 *    Processing options that specify pipeline-type, opts, and callbacks.
	 */
	static processContentInPipeline( env, frame, content, opts ) {
		// Build a pipeline
		let pipeline = env.pipelineFactory.getPipeline(
			opts.pipelineType,
			opts.pipelineOpts
		);

		// Set frame if necessary
		if ( opts.tplArgs ) {
			pipeline.setFrame( frame, opts.tplArgs.name, opts.tplArgs.attribs );
		} else {
			pipeline.setFrame( frame, null, [] );
		}

		// Set source offsets for this pipeline's content
		if ( opts.srcOffsets ) {
			pipeline.setSourceOffsets( opts.srcOffsets[ 0 ], opts.srcOffsets[ 1 ] );
		}

		// Set up provided callbacks
		if ( opts.chunkCB ) {
			pipeline.addListener( 'chunk', opts.chunkCB );
		}
		if ( opts.endCB ) {
			pipeline.addListener( 'end', opts.endCB );
		}
		if ( opts.documentCB ) {
			pipeline.addListener( 'document', opts.documentCB );
		}

		// Off the starting block ... ready, set, go!
		pipeline.process( content );
	}

	static extractExtBody( token ) {
		let src = token.getAttribute( 'source' );
		let tagWidths = token.dataAttribs.tagWidths;
		return src.substring( tagWidths[ 0 ], src.length - tagWidths[ 1 ] );
	}

	// Returns a JS string from the provided code point
	static codepointToUtf8( cp ) {
		return String.fromCodePoint( cp );
	}

	// Returns the code point at the first position of the string
	static utf8ToCodepoint( str ) {
		return str.codePointAt( 0 );
	}

	// Returns true if a given Unicode codepoint is a valid character in XML.
	static validateCodepoint( cp ) {
		return ( cp === 0x09 ) ||
			( cp === 0x0a ) ||
			( cp === 0x0d ) ||
			( cp >= 0x20 && cp <= 0xd7ff ) ||
			( cp >= 0xe000 && cp <= 0xfffd ) ||
			( cp >= 0x10000 && cp <= 0x10ffff );
	}

	static isValidDSR( dsr ) {
		return dsr &&
			typeof ( dsr[ 0 ] ) === 'number' && dsr[ 0 ] >= 0 &&
			typeof ( dsr[ 1 ] ) === 'number' && dsr[ 1 ] >= 0;
	}

	/**
	 * Determine whether the current token was an HTML tag in wikitext.
	 *
	 * @return {boolean}
	 */
	static isHTMLTag( token ) {
		switch ( token.constructor.name ) {
			case 'NlTk':
			case 'CommentTk':
			case 'EOFTk':
				return false;
			case 'TagTk':
			case 'EndTagTk':
			case 'SelfclosingTagTk':
				return token.dataAttribs.stx === 'html';
			default:
				console.assert( false, 'Unhandled token type' );
		}
	}
}

/**
 * @property linkTrailRegex
 *
 * This regex was generated by running through *all unicode characters* and
 * testing them against *all regexes* for linktrails in a default MW install.
 * We had to treat it a little bit, here's what we changed:
 *
 * 1. A-Z, though allowed in Walloon, is disallowed.
 * 2. '"', though allowed in Chuvash, is disallowed.
 * 3. '-', though allowed in Icelandic (possibly due to a bug), is disallowed.
 * 4. '1', though allowed in Lak (possibly due to a bug), is disallowed.
 */
Util.linkTrailRegex = new RegExp(
	'^[^\0-`{÷ĀĈ-ČĎĐĒĔĖĚĜĝĠ-ĪĬ-įĲĴ-ĹĻ-ĽĿŀŅņŉŊŌŎŏŒŔŖ-ŘŜŝŠŤŦŨŪ-ŬŮŲ-ŴŶŸ' +
	'ſ-ǤǦǨǪ-Ǯǰ-ȗȜ-ȞȠ-ɘɚ-ʑʓ-ʸʽ-̂̄-΅·΋΍΢Ϗ-ЯѐѝѠѢѤѦѨѪѬѮѰѲѴѶѸѺ-ѾҀ-҃҅-ҐҒҔҕҘҚҜ-ҠҤ-ҪҬҭҰҲ' +
	'Ҵ-ҶҸҹҼ-ҿӁ-ӗӚ-ӜӞӠ-ӢӤӦӪ-ӲӴӶ-ՠֈ-׏׫-ؠً-ٳٵ-ٽٿ-څڇ-ڗڙ-ڨڪ-ڬڮڰ-ڽڿ-ۅۈ-ۊۍ-۔ۖ-਀਄਋-਎਑਒' +
	'਩਱਴਷਺਻਽੃-੆੉੊੎-੘੝੟-੯ੴ-჏ჱ-ẼẾ-​\u200d-‒—-‗‚‛”--\ufffd\ufffd]+$' );

/**
 *
 * Check whether some text is a valid link trail.
 *
 * @param {string} text
 * @return {boolean}
 */
Util.isLinkTrail = function ( text ) {
	if ( text && text.match && text.match( this.linkTrailRegex ) ) {
		return true;
	} else {
		return false;
	}
};

/**
 *
 * Cannonicalizes a namespace name.
 *
 * Used by WikiConfig.
 *
 * @param {string} name non-normalized namespace name
 * @return {string}
 */
Util.normalizeNamespaceName = function ( name ) {
	return name.toLowerCase().replace( ' ', '_' );
};

/**
 *
 * Decode HTML5 entities in text.
 *
 * @param {string} text
 * @return {string}
 */
Util.decodeEntities = function ( text ) {
	return entities.decodeHTML5( text );
};

/**
 *
 * Entity-escape anything that would decode to a valid HTML entity
 *
 * @param {string} text
 * @return {string}
 */
Util.escapeEntities = function ( text ) {
	// [CSA] replace with entities.encode( text, 2 )?
	// but that would encode *all* ampersands, where we apparently just want
	// to encode ampersands that precede valid entities.
	return text.replace( /&[#0-9a-zA-Z]+;/g, function ( match ) {
		let decodedChar = Util.decodeEntities( match );
		if ( decodedChar !== match ) {
			// Escape the and
			return '&amp;' + match.substr( 1 );
		} else {
			// Not an entity, just return the string
			return match;
		}
	} );
};

Util.escapeHtml = function ( s ) {
	return s.replace( /["'&<>]/g, entities.encodeHTML5 );
};

/** Encode all characters as entity references.  This is done to make
 *  characters safe for wikitext (regardless of whether they are
 *  HTML-safe). */
Util.entityEncodeAll = function ( s ) {
	// this is surrogate-aware
	return Array.from( s ).map( function ( c ) {
		c = c.codePointAt( 0 ).toString( 16 ).toUpperCase();
		if ( c.length === 1 ) { c = '0' + c; } // convention
		if ( c === 'A0' ) { return '&nbsp;'; } // special-case common usage
		return '&#x' + c + ';';
	} ).join( '' );
};

/**
 * Determine whether the protocol of a link is potentially valid. Use the
 * environment's per-wiki config to do so.
 */
Util.isProtocolValid = function ( linkTarget, env ) {
	let wikiConf = env.conf.wiki;
	if ( typeof linkTarget === 'string' ) {
		return wikiConf.hasValidProtocol( linkTarget );
	} else {
		return true;
	}
};

/**
 * Escape special regexp characters in a string used to build a regexp
 */
Util.escapeRegExp = function ( s ) {
	return s.replace( /[\^\\$*+?.()|{}\[\]\/]/g, '\\$&' );
};

/* Magic words masquerading as templates. */
Util.magicMasqs = new Set( [ 'defaultsort', 'displaytitle' ] );

// Helper function to process extension source
Util.processExtSource = function ( manager, extToken, opts ) {
	let extBody = Util.extractExtBody( extToken );
	let tagWidths = extToken.dataAttribs.tagWidths;

	// FIXME: Should this be specific to the extension
	// Or is it okay to do this unconditionally for all?
	// Right now, this code is run only for ref and references,
	// so not a real problem, but if this is used on other extensions,
	// requires addressing.
	//
	// FIXME: SSS: This stripping maybe be unnecessary after all.
	//
	// Strip all leading white-space
	let wsMatch = extBody.match( /^(\s*)([^]*)$/ );
	let leadingWS = wsMatch[ 1 ];

	// Update content to normalized form
	let content = wsMatch[ 2 ];

	if ( !content || content.length === 0 ) {
		opts.emptyContentCB( opts.res );
	} else {
		// Pass an async signal since the ext-content is not processed completely.
		opts.parentCB( { tokens: opts.res, async: true } );

		// Wrap templates always
		opts.pipelineOpts = Util.extendProps( {}, opts.pipelineOpts, { wrapTemplates: true } );

		let tsr = extToken.dataAttribs.tsr;
		opts.srcOffsets = [ tsr[ 0 ] + tagWidths[ 0 ] + leadingWS.length, tsr[ 1 ] - tagWidths[ 1 ] ];

		// Process ref content
		Util.processContentInPipeline( manager.env, manager.frame, content, opts );
	}
};

Util.getArgInfo = function ( extToken ) {
	let name = extToken.getAttribute( 'name' );
	let options = extToken.getAttribute( 'options' );
	return {
		dict: {
			name: name,
			attrs: Util.kvToHash( options, true ),
			body: { extsrc: Util.extractExtBody( extToken ) }
		}
	};
};

Util.placeholder = function ( content, dataAttribs, endAttribs ) {
	if ( content === null ) {
		return [
			new tokens.SelfclosingTagTk( 'meta', [
				new tokens.KV( 'typeof', 'mw:Placeholder' )
			], dataAttribs )
		];
	} else {
		return [
			new tokens.TagTk( 'span', [
				new tokens.KV( 'typeof', 'mw:Placeholder' )
			], dataAttribs ),
			content,
			new 'EndTagTk'( 'span', [], endAttribs )
		];
	}
};

Util.parseMediaDimensions = function ( str, onlyOne ) {
	let dimensions = null;
	let match = str.match( /^(\d*)(?:x(\d+))?\s*(?:px\s*)?$/ );
	if ( match ) {
		dimensions = { x: Number( match[ 1 ] ) };
		if ( match[ 2 ] !== undefined ) {
			if ( onlyOne ) { return null; }
			dimensions.y = Number( match[ 2 ] );
		}
	}
	return dimensions;
};

// More generally, this is defined by the media handler in core
Util.validateMediaParam = function ( num ) {
	return num > 0;
};

module.exports = Util;
