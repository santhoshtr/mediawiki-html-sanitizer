'use strict';

let Util; // Util module var for circular dependency avoidance
const requireUtil = function () {
	if ( !Util ) {
		Util = require( './utils/Util.js' ); // (circular dep)
	}
}; // initialized later to avoid circular dependency

/**
 * Key-value pair.
 *
 * @constructor
 * @param {Mixed} k
 * @param {Mixed} v
 * @param {Array} srcOffsets The source offsets.
 */
class KV {
	constructor( k, v, srcOffsets ) {
		this.k = k;
		this.v = v;
		if ( srcOffsets ) {
			this.srcOffsets = srcOffsets;
		}
	}
}
/**
 * @class Token
 *
 * Catch-all class for all token types.
 * @abstract
 */

/*
 * Generic token attribute accessors
 *
 * TODO make this a real base class instead of some weird hackish object.
 */
class Token {
	/**
	 * Generic set attribute method.
	 *
	 * @param {string} name
	 * @param {Mixed} value
	 */
	addAttribute( name, value ) {
		this.attribs.push( new KV( name, value ) );
	}

	/**
	 * Generic set attribute method with support for change detection.
	 * Set a value and preserve the original wikitext that produced it.
	 *
	 * @param {string} name
	 * @param {Mixed} value
	 * @param {Mixed} origValue
	 */
	addNormalizedAttribute( name, value, origValue ) {
		this.addAttribute( name, value );
		this.setShadowInfo( name, value, origValue );
	}

	/**
	 *
	 * Generic attribute accessor.
	 *
	 * @param {string} name
	 * @return {Mixed}
	 */
	getAttribute( name ) {
		requireUtil();
		return Util.lookup( this.attribs, name );
	}

	/**
	 *
	 * Set an unshadowed attribute.
	 *
	 * @param {string} name
	 * @param {Mixed} value
	 */
	setAttribute( name, value ) {
		requireUtil();
		// First look for the attribute and change the last match if found.
		for ( let i = this.attribs.length - 1; i >= 0; i-- ) {
			let kv = this.attribs[ i ];
			let k = kv.k;
			if ( k.constructor === String && k.toLowerCase() === name ) {
				kv.v = value;
				this.attribs[ i ] = kv;
				return;
			}
		}
		// Nothing found, just add the attribute
		this.addAttribute( name, value );
	}

	setAttributes( attributes ) {
		let keys = Object.keys( attributes );
		for ( let i = 0; i < keys.length; i++ ) {
			this.setAttribute( keys[ i ], attributes[ keys[ i ] ] );
		}
	}
	/**
	 *
	 * Store the original value of an attribute in a token's dataAttribs.
	 *
	 * @param {string} name
	 * @param {Mixed} value
	 * @param {Mixed} origValue
	 */
	setShadowInfo( name, value, origValue ) {
		// Don't shadow if value is the same or the orig is null
		if ( value !== origValue && origValue !== null ) {
			if ( !this.dataAttribs.a ) {
				this.dataAttribs.a = {};
			}
			this.dataAttribs.a[ name ] = value;
			if ( !this.dataAttribs.sa ) {
				this.dataAttribs.sa = {};
			}
			if ( origValue !== undefined ) {
				this.dataAttribs.sa[ name ] = origValue;
			}
		}
	}

	/**
	 *
	 * Attribute info accessor for the wikitext serializer. Performs change
	 * detection and uses unnormalized attribute values if set. Expects the
	 * context to be set to a token.
	 *
	 * @param {string} name
	 * @return {Object} Information about the shadow info attached to this attribute.
	 * @return {Mixed} return.value
	 * @return {boolean} return.modified Whether the attribute was changed between parsing and now.
	 * @return {boolean} return.fromsrc Whether we needed to get the source of the attribute to round-trip it.
	 */
	getAttributeShadowInfo( name ) {
		requireUtil();
		let curVal = Util.lookup( this.attribs, name );

		// Not the case, continue regular round-trip information.
		if ( this.dataAttribs.a === undefined ||
				this.dataAttribs.a[ name ] === undefined ) {
			return {
				value: curVal,
				// Mark as modified if a new element
				modified: Object.keys( this.dataAttribs ).length === 0,
				fromsrc: false
			};
		} else if ( this.dataAttribs.a[ name ] !== curVal ) {
			return {
				value: curVal,
				modified: true,
				fromsrc: false
			};
		} else if ( this.dataAttribs.sa === undefined ||
				this.dataAttribs.sa[ name ] === undefined ) {
			return {
				value: curVal,
				modified: false,
				fromsrc: false
			};
		} else {
			return {
				value: this.dataAttribs.sa[ name ],
				modified: false,
				fromsrc: true
			};
		}
	}

	/**
	 * Completely remove all attributes with this name.
	 *
	 * @param {string} name
	 */
	removeAttribute( name ) {
		let out = [];
		let attribs = this.attribs;
		for ( let i = 0, l = attribs.length; i < l; i++ ) {
			let kv = attribs[ i ];
			if ( kv.k.toLowerCase() !== name ) {
				out.push( kv );
			}
		}
		this.attribs = out;
	}

	/**
	 * Add a space-separated property value
	 *
	 * @param {string} name
	 * @param {Mixed} value The value to add to the attribute.
	 */
	addSpaceSeparatedAttribute( name, value ) {
		requireUtil();
		let curVal = Util.lookupKV( this.attribs, name );
		let vals;
		if ( curVal !== null ) {
			vals = curVal.v.split( /\s+/ );
			for ( let i = 0, l = vals.length; i < l; i++ ) {
				if ( vals[ i ] === value ) {
					// value is already included, nothing to do.
					return;
				}
			}
			// Value was not yet included in the existing attribute, just add
			// it separated with a space
			this.setAttribute( curVal.k, curVal.v + ' ' + value );
		} else {
			// the attribute did not exist at all, just add it
			this.addAttribute( name, value );
		}
	}

	/**
	 *
	 * Get the wikitext source of a token.
	 *
	 * @param {MWParserEnvironment} env
	 * @return {string}
	 */
	getWTSource( env ) {
		var tsr = this.dataAttribs.tsr;
		console.assert( Array.isArray( tsr ), 'Expected token to have tsr info.' );
		return env.page.src.substring( tsr[ 0 ], tsr[ 1 ] );
	}

	attributesToString( attribs ) {
		let buf = '';
		for ( let i = 0, n = attribs.length; i < n; i++ ) {
			let a = attribs[ i ];
			buf += ' ' + a.k + '="' + Util.escapeHtml( a.v ) + '"';
		}
		return buf;
	}
}

class TagTk extends Token {
	/**
	* @param {string} name
	* @param {KV[]} attribs
	* @param {Object} dataAttribs Data-parsoid object.
	*/
	constructor( name, attribs, dataAttribs ) {
		super();
		this.name = name;
		this.attribs = attribs || [];
		this.dataAttribs = dataAttribs || {};
		this.tagToStringFns = {
			listItem() {
				return '<li:' + this.bullets.join( '' ) + '>';
			},
			'mw-quote'() {
				return '<mw-quote:' + this.value + '>';
			},
			urllink() {
				return '<urllink:' + this.attribs[ 0 ].v + '>';
			},
			'behavior-switch'() {
				return '<behavior-switch:' + this.attribs[ 0 ].v + '>';
			}
		};

	}

	/**
	 * @method
	 * @return {string}
	 */
	toJSON() {
		return Object.assign( { type: 'TagTk' }, this );
	}

	/**
	 * @return {string}
	 */
	defaultToString() {
		return '<' + this.name + this.attributesToString( this.attribs ) + '>';
	}

	toHtml() {
		return this.defaultToString();
	}

	/**
	 * @param {boolean} compact Whether to return the full HTML, or just the tag name.
	 * @return {string}
	 */
	toString( compact ) {
		requireUtil();
		if ( Util.isHTMLTag( this ) ) {
			if ( compact ) {
				return '<HTML:' + this.name + '>';
			} else {

				return '<HTML:' + this.name + ' ' + this.attributesToString( this.attribs ) + '>';
			}
		} else {
			let f = this.tagToStringFns[ this.name ];
			return f ? f.bind( this )() : this.defaultToString();
		}
	}

}

/**
 * @class
 * @extends Token
 *
 * HTML end tag token.
 *
 * @constructor
 * @param {string} name
 * @param {KV[]} attribs
 * @param {Object} dataAttribs
 */
class EndTagTk extends Token {
	constructor( name, attribs, dataAttribs ) {
		super();
		this.name = name;
		this.attribs = attribs || [];
		this.dataAttribs = dataAttribs || {};
	}

	/**
	 * @method
	 * @return {string}
	 */
	toJSON() {
		return Object.assign( { type: 'EndTagTk' }, this );
	}

	toHtml() {
		return '</' + this.name + '>';
	}

	/**
	 * @method
	 * @return {string}
	 */
	toString() {
		if ( Util.isHTMLTag( this ) ) {
			return '</HTML:' + this.name + '>';
		} else {
			return '</' + this.name + '>';
		}
	}
}

/**
 * @class
 *
 * HTML tag token for a self-closing tag (like a br or hr).
 *
 * @extends Token
 * @constructor
 * @param {string} name
 * @param {KV[]} attribs
 * @param {Object} dataAttribs
 */
class SelfclosingTagTk extends Token {
	constructor( name, attribs, dataAttribs ) {
		super();
		this.name = name;
		this.attribs = attribs || [];
		this.dataAttribs = dataAttribs || {};
	}

	/**
	 * @method
	 * @return {string}
	 */
	toJSON() {
		return Object.assign( { type: 'SelfclosingTagTk' }, this );
	}

	toHtml() {
		return '<' + this.name + this.attributesToString( this.attribs ) + ' />';
	}

	/**
	 * @method multiTokenArgToString
	 * @param {string} key
	 * @param {Object} arg
	 * @param {string} indent The string by which we should indent each new line.
	 * @param {string} indentIncrement The string we should add to each level of indentation.
	 * @return {Object}
	 * @return {boolean} return.present Whether there is any non-empty string representation of these tokens.
	 * @return {string} return.str
	 */
	multiTokenArgToString( key, arg, indent, indentIncrement ) {
		requireUtil();
		var newIndent = indent + indentIncrement;
		var present = true;
		var toks = Util.toStringTokens( arg, newIndent );
		var str = toks.join( '\n' + newIndent );

		if ( toks.length > 1 || str[ 0 ] === '<' ) {
			str = [ key, ':{\n', newIndent, str, '\n', indent, '}' ].join( '' );
		} else {
			present = ( str !== '' );
		}

		return { present: present, str: str };
	}

	/**
	 * @method attrsToSTring
	 *
	 * Get a string representation of the tag's attributes.
	 *
	 * @param {string} indent The string by which to indent every line.
	 * @param {string} indentIncrement The string to add to every successive level of indentation.
	 * @param {number} startAttrIndex Where to start converting attributes.
	 * @return {string}
	 */
	attrsToString( indent, indentIncrement, startAttrIndex ) {
		var buf = [];
		for ( var i = startAttrIndex, n = this.attribs.length; i < n; i++ ) {
			var a = this.attribs[ i ];
			var kVal = this.multiTokenArgToString( 'k', a.k, indent, indentIncrement );
			var vVal = this.multiTokenArgToString( 'v', a.v, indent, indentIncrement );

			if ( kVal.present && vVal.present ) {
				buf.push( [ kVal.str, '=', vVal.str ].join( '' ) );
			} else {
				if ( kVal.present ) {
					buf.push( kVal.str );
				}
				if ( vVal.present ) {
					buf.push( vVal.str );
				}
			}
		}

		return buf.join( '\n' + indent + '|' );
	}

	/**
	 * @method
	 * @param {boolean} compact Whether to return the full HTML, or just the tag name.
	 * @param {string} indent The string by which to indent each line.
	 * @return {string}
	 */
	defaultToString( compact, indent ) {
		requireUtil();
		if ( compact ) {
			var buf = '<' + this.name + '>:';
			var attr0 = this.attribs[ 0 ];
			return attr0 ? buf + Util.toStringTokens( attr0.k, '\n' ) : buf;
		} else {
			if ( !indent ) {
				indent = '';
			}
			var origIndent = indent;
			var indentIncrement = '  ';
			indent += indentIncrement;
			return [ '<', this.name, '>(\n', indent, this.attrsToString( indent, indentIncrement, 0 ), '\n', origIndent, ')' ].join( '' );
		}
	}

	/**
	 * @method
	 * @param {boolean} compact Whether to return the full HTML, or just the tag name.
	 * @param {string} indent The string by which to indent each line.
	 * @return {string}
	 */
	toString( compact, indent ) {
		if ( Util.isHTMLTag( this ) ) {
			return '<HTML:' + this.name + ' />';
		} else {
			let f = SelfclosingTagTk.prototype.tagToStringFns[ this.name ];
			return f ? f.bind( this )( compact, indent ) : this.defaultToString( compact, indent );
		}
	}

}

const selfclosingTagTktagToStringFns = {
	extlink( compact, indent ) {
		requireUtil();
		var indentIncrement = '  ';
		var href = Util.toStringTokens( Util.lookup( this.attribs, 'href' ), indent + indentIncrement );
		if ( compact ) {
			return [ '<extlink:', href, '>' ].join( '' );
		} else {
			if ( !indent ) {
				indent = '';
			}
			var origIndent = indent;
			indent += indentIncrement;
			var content = Util.lookup( this.attribs, 'mw:content' );
			content = this.multiTokenArgToString( 'v', content, indent, indentIncrement ).str;
			return [
				'<extlink>(\n', indent,
				'href=', href, '\n', indent,
				'content=', content, '\n', origIndent,
				')'
			].join( '' );
		}
	},

	wikilink( compact, indent ) {
		requireUtil();
		if ( !indent ) {
			indent = '';
		}
		var indentIncrement = '  ';
		var href = Util.toStringTokens( Util.lookup( this.attribs, 'href' ), indent + indentIncrement );
		if ( compact ) {
			return [ '<wikilink:', href, '>' ].join( '' );
		} else {
			if ( !indent ) {
				indent = '';
			}
			var origIndent = indent;
			indent += indentIncrement;
			var tail = Util.lookup( this.attribs, 'tail' );
			var content = this.attrsToString( indent, indentIncrement, 2 );
			return [
				'<wikilink>(\n', indent,
				'href=', href, '\n', indent,
				'tail=', tail, '\n', indent,
				'content=', content, '\n', origIndent,
				')'
			].join( '' );
		}
	}
};

// Hide tagToStringFns when serializing tokens to JSON
Object.defineProperty( SelfclosingTagTk.prototype, 'tagToStringFns', {
	enumerable: false,
	value: selfclosingTagTktagToStringFns
} );

/**
 * @class
 *
 * Newline token.
 *
 * @extends Token
 * @constructor
 * @param {Array} tsr The TSR of the newline(s).
 */
class NlTk {
	constructor( tsr ) {
		if ( tsr ) {
			this.dataAttribs = { tsr: tsr };
		}
	}

	/**
	 * @method
	 *
	 * Convert the token to JSON.
	 *
	 * @return {string} JSON string.
	 */
	toJSON() {
		return Object.assign( { type: 'NlTk' }, this );
	}

	/**
	 * @method
	 *
	 * Convert the token to a simple string.
	 *
	 * @return {"\\n"}
	 */
	toString() {
		return '\\n';
	}
}

/**
 * @class
 * @extends Token
 * @constructor
 * @param {string} value
 * @param {Object} dataAttribs data-parsoid object.
 */
class CommentTk {
	constructor( value, dataAttribs ) {
		this.value = value;
		// won't survive in the DOM, but still useful for token serialization
		if ( dataAttribs !== undefined ) {
			this.dataAttribs = dataAttribs;
		}
	}

	toJSON() {
		return Object.assign( { type: 'COMMENT' }, this );
	}

	toHtml() {
		return this.toString();
	}

	toString() {
		return '<!--' + this.value + '-->';
	}
}

/* -------------------- EOFTk -------------------- */
class EOFTk {

	toJSON() {
		return Object.assign( { type: 'EOFTk' }, this );
	}

	toString() {
		return '';
	}
}

module.exports = {
	TagTk,
	EndTagTk,
	SelfclosingTagTk,
	NlTk,
	CommentTk,
	EOFTk,
	KV
};
