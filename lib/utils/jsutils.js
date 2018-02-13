/*
 * This file contains Parsoid-independent JS helper functions.
 * Over time, more functions can be migrated out of various other files here.
 */

'use strict';

require( 'core-js/fn/object/entries' );

const rejectMutation = function () {
	throw new TypeError( 'Mutation attempted on read-only collection.' );
};

const lastItem = function ( array ) {
	console.assert( Array.isArray( array ) );
	return array[ array.length - 1 ];
};

const JSUtils = {

	lastItem: lastItem,

	mapObject: function ( obj ) {
		return new Map( Object.entries( obj ) );
	},

	// Return a two-way Map that maps each element to its index (and vice-versa)
	arrayMap: function ( arr ) {
		var m = new Map( arr.map( function ( e, i ) { return [ e, i ]; } ) );
		m.item = function ( i ) { return arr[ i ]; };
		return m;
	},

	// ES6 maps/sets are still writable even when frozen, because they
	// store data inside the object linked from an internal slot.
	// This freezes a map by disabling the mutation methods, although
	// its not bulletproof: you could use `Map.prototype.set.call(m, ...)`
	// to still mutate the backing store.
	freezeMap: function ( it, freezeEntries ) {
		// Allow `it` to be an iterable, as well as a map.
		if ( !( it instanceof Map ) ) { it = new Map( it ); }
		it.set = it.clear = it.delete = rejectMutation;
		Object.freeze( it );
		if ( freezeEntries ) {
			it.forEach( function ( v, k ) {
				JSUtils.deepFreeze( v );
				JSUtils.deepFreeze( k );
			} );
		}
		return it;
	},

	// This makes a set read-only.
	freezeSet: function ( it, freezeEntries ) {
		// Allow `it` to be an iterable, as well as a set.
		if ( !( it instanceof Set ) ) { it = new Set( it ); }
		it.add = it.clear = it.delete = rejectMutation;
		Object.freeze( it );
		if ( freezeEntries ) {
			it.forEach( function ( v ) {
				JSUtils.deepFreeze( v );
			} );
		}
		return it;
	},

	// Deep-freeze an object
	// See https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Object/freeze
	deepFreeze: function ( o ) {
		if ( !( o instanceof Object ) ) {
			return o;
		} else if ( Object.isFrozen( o ) ) {
			// Note that this might leave an unfrozen reference somewhere in
			// the object if there is an already frozen object containing an
			// unfrozen object.
			return o;
		} else if ( o instanceof Map ) {
			return JSUtils.freezeMap( o, true );
		} else if ( o instanceof Set ) {
			return JSUtils.freezeSet( o, true );
		}

		Object.freeze( o );
		for ( var propKey in o ) {
			var desc = Object.getOwnPropertyDescriptor( o, propKey );
			if ( ( !desc ) || desc.get || desc.set ) {
				// If the object is on the prototype or is a getter, skip it.
				continue;
			}
			// Recursively call deepFreeze.
			JSUtils.deepFreeze( desc.value );
		}
		return o;
	},

	deepFreezeButIgnore: function ( o, ignoreFields ) {
		for ( let prop in o ) {
			let desc = Object.getOwnPropertyDescriptor( o, prop );
			if ( ignoreFields[ prop ] === true || ( !desc ) || desc.get || desc.set ) {
				// Ignore getters, primitives, and explicitly ignored fields.
				return;
			}
			o[ prop ] = JSUtils.deepFreeze( desc.value );
		}
		Object.freeze( o );
	},

	// Join pieces of regular expressions together.  This helps avoid
	// having to switch between string and regexp quoting rules, and
	// can also give you a poor-man's version of the "x" flag, ie:
	//  var re = rejoin( "(",
	//      /foo|bar/, "|",
	//      someRegExpFromAVariable
	//      ")", { flags: "i" } );
	// Note that this is basically string concatenation, except that
	// regular expressions are converted to strings using their `.source`
	// property, and then the final resulting string is converted to a
	// regular expression.
	// If the final argument is a regular expression, its flags will be
	// used for the result.  Alternatively, you can make the final argument
	// an object, with a `flags` property (as shown in the example above).
	rejoin: function () {
		var regexps = Array.prototype.slice.call( arguments );
		var last = lastItem( regexps );
		var flags;
		if ( typeof ( last ) === 'object' ) {
			if ( last instanceof RegExp ) {
				flags = /\/([gimy]*)$/.exec( last.toString() )[ 1 ];
			} else {
				flags = regexps.pop().flags;
			}
		}
		return new RegExp( regexps.reduce( function ( acc, r ) {
			return acc + ( r instanceof RegExp ? r.source : r );
		}, '' ), flags === undefined ? '' : flags );
	},

	// Append an array to an accumulator using the most efficient method
	// available. Makes sure that accumulation is O(n).
	pushArray: function push( accum, arr ) {
		if ( accum.length < arr.length ) {
			return accum.concat( arr );
		} else {
			// big accum & arr
			for ( var i = 0, l = arr.length; i < l; i++ ) {
				accum.push( arr[ i ] );
			}
			return accum;
		}
	},

	/**
	 * Determine whether two objects are identical, recursively.
	 */
	deepEquals: function ( a, b ) {
		var i;
		if ( a === b ) {
			// If only it were that simple.
			return true;
		}

		if ( a === undefined || b === undefined ||
				a === null || b === null ) {
			return false;
		}

		if ( a.constructor !== b.constructor ) {
			return false;
		}

		if ( a instanceof Object ) {
			for ( i in a ) {
				if ( !this.deepEquals( a[ i ], b[ i ] ) ) {
					return false;
				}
			}
			for ( i in b ) {
				if ( a[ i ] === undefined ) {
					return false;
				}
			}
			return true;
		}

		return false;
	}

};

module.exports.JSUtils = JSUtils;
